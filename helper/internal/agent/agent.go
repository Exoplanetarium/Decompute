// Package agent turns the helper binary into a resident process: it
// polls for jobs assigned to this node and executes them via Docker. This
// is the piece that didn't exist at all before — the one-shot detection
// binary (internal/detect, internal/client's ReportSpec) never gave a
// node any ongoing presence, so nothing could ever dispatch work to it.
package agent

import (
	"context"
	"fmt"
	"mime"
	"os"
	"path/filepath"
	"time"

	"github.com/decompute/helper/internal/client"
	"github.com/decompute/helper/internal/docker"
	"github.com/decompute/helper/internal/workload"
)

const (
	heartbeatInterval = 15 * time.Second
	metricsInterval   = 5 * time.Second
	logFlushInterval  = 2 * time.Second
	logBatchSize      = 50
)

// Run blocks forever, polling for and executing jobs assigned to this
// node. Refuses to start if Docker isn't available — there'd be nothing
// it could actually do with a job once one arrived.
func Run(apiBase, token string) int {
	if !docker.Available() {
		fmt.Println(docker.SetupGuidance())
		return 1
	}

	c := client.NewAgentClient(apiBase, token)
	fmt.Printf("Agent running against %s — checking in every %s.\n", apiBase, heartbeatInterval)

	for {
		job, err := c.Heartbeat()
		if err != nil {
			fmt.Println("heartbeat failed:", err)
		} else if job != nil {
			runJob(c, job)
		}
		time.Sleep(heartbeatInterval)
	}
}

func runJob(c *client.AgentClient, job *client.AgentJob) {
	fmt.Printf("Claiming job %s (%s)...\n", job.ID, job.DockerImage)
	if err := c.ClaimJob(job.ID); err != nil {
		// Lost a race, or the job went stale between the heartbeat and now
		// — not fatal, the next heartbeat reflects reality either way.
		fmt.Println("couldn't claim job:", err)
		return
	}

	policy, err := workload.Resolve(job.WorkloadID, job.DockerImage)
	if err != nil {
		fmt.Println("refusing unauthorized workload:", err)
		if reportErr := c.CompleteJob(job.ID, "failed", "Provider security policy rejected this workload"); reportErr != nil {
			fmt.Println("couldn't report policy rejection:", reportErr)
		}
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(job.MaxRuntimeHours*float64(time.Hour)))
	defer cancel()

	// /output is always mounted — most images never write anything there,
	// which is fine (nothing to upload afterward). Best-effort cleanup: a
	// leftover temp dir from a failed RemoveAll isn't worth failing the job over.
	outputDir, err := os.MkdirTemp("", "decompute-job-*")
	if err != nil {
		fmt.Println("couldn't create output dir:", err)
		outputDir = ""
	} else {
		defer os.RemoveAll(outputDir)
	}

	lines := make(chan docker.LogLine, 100)
	logsDone := make(chan struct{})
	go flushLogs(c, job.ID, lines, logsDone)

	metricsDone := make(chan struct{})
	go reportMetrics(ctx, c, job.ID, metricsDone)

	runErr := docker.Run(ctx, job.ID, job.WorkloadID, policy.Image, job.GPUsNeeded, policy.NetworkAccess, job.EnvVars, outputDir, lines)
	close(lines)
	cancel() // stop the metrics loop now — don't wait for the deferred cancel at function exit
	<-logsDone
	<-metricsDone

	if runErr != nil {
		fmt.Println("job failed:", runErr)
		if err := c.CompleteJob(job.ID, "failed", runErr.Error()); err != nil {
			fmt.Println("couldn't report failure:", err)
		}
		return
	}

	if outputDir != "" {
		uploadOutput(c, job.ID, outputDir)
	}

	fmt.Println("job completed.")
	if err := c.CompleteJob(job.ID, "done", ""); err != nil {
		fmt.Println("couldn't report completion:", err)
	}
}

// uploadOutput looks for a single file in the container's output mount and
// uploads it, if present. Best-effort: a job that produced no file (most
// jobs — this is only for image/video-generation-shaped work) or an upload
// that fails doesn't fail the job itself, since the actual work already
// completed successfully by this point.
func uploadOutput(c *client.AgentClient, jobID, outputDir string) {
	entries, err := os.ReadDir(outputDir)
	if err != nil || len(entries) == 0 {
		return
	}
	name := entries[0].Name()
	path := filepath.Join(outputDir, name)
	info, err := os.Lstat(path)
	if err != nil || !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
		fmt.Println("refusing non-regular job output")
		return
	}
	const maxArtifactBytes = 15 * 1024 * 1024
	if info.Size() > maxArtifactBytes {
		fmt.Printf("refusing oversized job output (%d bytes)\n", info.Size())
		return
	}
	data, err := os.ReadFile(path)
	if err != nil {
		fmt.Println("couldn't read job output file:", err)
		return
	}

	contentType := mime.TypeByExtension(filepath.Ext(name))
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	fmt.Printf("uploading job output %s (%s, %d bytes)...\n", name, contentType, len(data))
	if err := c.UploadArtifact(jobID, contentType, data); err != nil {
		fmt.Println("couldn't upload job output:", err)
	}
}

// flushLogs batches container output lines and POSTs them periodically
// (and immediately once a batch fills), rather than one request per line.
func flushLogs(c *client.AgentClient, jobID string, lines <-chan docker.LogLine, done chan<- struct{}) {
	defer close(done)
	ticker := time.NewTicker(logFlushInterval)
	defer ticker.Stop()

	var batch []client.LogLine
	flush := func() {
		if len(batch) == 0 {
			return
		}
		if err := c.PostLogs(jobID, batch); err != nil {
			fmt.Println("couldn't post logs:", err)
		}
		batch = nil
	}

	for {
		select {
		case l, ok := <-lines:
			if !ok {
				flush()
				return
			}
			batch = append(batch, client.LogLine{Level: "INFO", Msg: l.Msg})
			if len(batch) >= logBatchSize {
				flush()
			}
		case <-ticker.C:
			flush()
		}
	}
}

// reportMetrics samples nvidia-smi and POSTs a heartbeat until the job's
// context ends (either it finished or its timeout fired).
func reportMetrics(ctx context.Context, c *client.AgentClient, jobID string, done chan<- struct{}) {
	defer close(done)
	ticker := time.NewTicker(metricsInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			usage, vram, err := sampleGPU()
			if err != nil {
				continue // best-effort — a missing/unreadable sample is just skipped
			}
			if err := c.PostHeartbeats(jobID, []client.HeartbeatSample{{GPUUsagePct: usage, VRAMUsedGB: vram}}); err != nil {
				fmt.Println("couldn't post heartbeat:", err)
			}
		}
	}
}
