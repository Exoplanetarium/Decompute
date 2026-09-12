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
	"strings"
	"time"

	"github.com/decompute/helper/internal/client"
	"github.com/decompute/helper/internal/docker"
	"github.com/decompute/helper/internal/workload"
)

const (
	heartbeatInterval = 15 * time.Second
	metricsInterval   = 5 * time.Second
	// Generous: these images carry baked-in model weights, and a home
	// connection pulling several GB for the first time is not an error.
	imagePullTimeout = 45 * time.Minute
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
	downloadMbps, uploadMbps := c.BenchmarkNetwork()
	benchmark := client.Benchmark{Version: "gpu-capability-v1", GPUScore: benchmarkGPU(), DownloadMbps: downloadMbps, UploadMbps: uploadMbps}
	fmt.Printf("Agent running against %s — checking in every %s.\n", apiBase, heartbeatInterval)

	for {
		capabilities := client.Capabilities{Benchmark: benchmark}
		for _, modelID := range []string{"CompVis/stable-diffusion-v1-4", "Systran/faster-whisper-small", "sentence-transformers/all-MiniLM-L6-v2"} {
			if docker.Cached(modelID) {
				capabilities.CachedModels = append(capabilities.CachedModels, modelID)
			}
		}
		job, err := c.Heartbeat(capabilities)
		if err != nil {
			fmt.Println("heartbeat failed:", err)
		} else if job != nil {
			runJob(c, job, capabilities)
		}
		time.Sleep(heartbeatInterval)
	}
}

// keepNodeAlive holds the node's heartbeat open while a job is executing.
// Everything in runJob blocks the poll loop above — including the first
// multi-gigabyte image pull — and both the scheduler (90s) and the stuck-job
// reaper (5 minutes) treat a node that has stopped checking in as gone. Left
// alone, that meant a long job got its own node declared offline and the work
// reaped out from under it. The job the API hands back here is deliberately
// discarded: the poll loop stays the only place that starts work.
func keepNodeAlive(ctx context.Context, c *client.AgentClient, capabilities client.Capabilities) {
	ticker := time.NewTicker(heartbeatInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if _, err := c.Heartbeat(capabilities); err != nil {
				fmt.Println("liveness heartbeat failed:", err)
			}
		}
	}
}

func runJob(c *client.AgentClient, job *client.AgentJob, capabilities client.Capabilities) {
	fmt.Printf("Claiming job %s (%s, seed %d)...\n", job.JobID, job.Execution.DockerImage, job.Seed)
	if err := c.ClaimJob(job.JobID); err != nil {
		// Lost a race, or the job went stale between the heartbeat and now
		// — not fatal, the next heartbeat reflects reality either way.
		fmt.Println("couldn't claim job:", err)
		return
	}

	policy, err := workload.Resolve(job.Execution.WorkloadID, job.Execution.DockerImage)
	if err != nil {
		fmt.Println("refusing unauthorized workload:", err)
		if reportErr := c.CompleteJob(job.JobID, "failed", "Provider security policy rejected this workload"); reportErr != nil {
			fmt.Println("couldn't report policy rejection:", reportErr)
		}
		return
	}

	liveCtx, stopLiveness := context.WithCancel(context.Background())
	defer stopLiveness()
	go keepNodeAlive(liveCtx, c, capabilities)

	// Fetch the image before the runtime clock starts. These images are
	// several GB, and a provider's first job would otherwise spend most (or
	// all) of the runtime it is being paid for downloading rather than
	// working — and be killed at the cap with nothing to show for it.
	fmt.Println("making sure the workload image is present...")
	pullCtx, cancelPull := context.WithTimeout(context.Background(), imagePullTimeout)
	pullErr := docker.Pull(pullCtx, policy.Image)
	cancelPull()
	if pullErr != nil {
		fmt.Println("couldn't fetch the workload image:", pullErr)
		if err := c.CompleteJob(job.JobID, "failed", "Could not download the workload image: "+pullErr.Error()); err != nil {
			fmt.Println("couldn't report image pull failure:", err)
		}
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(job.Execution.MaxRuntimeHours*float64(time.Hour)))
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
	inputDir, inputErr := materializeInputs(c, job)
	if inputErr != nil {
		fmt.Println("input verification failed:", inputErr)
		_ = c.CompleteJob(job.JobID, "failed", "Input verification failed")
		return
	}
	if inputDir != "" {
		defer os.RemoveAll(inputDir)
	}

	lines := make(chan docker.LogLine, 100)
	logsDone := make(chan struct{})
	go flushLogs(c, job.JobID, lines, logsDone)

	metricsDone := make(chan struct{})
	go reportMetrics(ctx, c, job.JobID, metricsDone)

	runErr := docker.Run(ctx, job.JobID, job.Execution.CacheKey, policy.Image, job.Execution.GPUsNeeded, policy.NetworkAccess, job.Execution.EnvVars, inputDir, outputDir, lines)
	close(lines)
	cancel() // stop the metrics loop now — don't wait for the deferred cancel at function exit
	<-logsDone
	<-metricsDone

	if runErr != nil {
		fmt.Println("job failed:", runErr)
		if err := c.CompleteJob(job.JobID, "failed", runErr.Error()); err != nil {
			fmt.Println("couldn't report failure:", err)
		}
		return
	}

	if outputDir != "" {
		if err := uploadOutput(c, job, outputDir); err != nil {
			fmt.Println("result validation failed:", err)
			_ = c.CompleteJob(job.JobID, "failed", "Result validation failed: "+err.Error())
			return
		}
	} else if job.Result.Required {
		_ = c.CompleteJob(job.JobID, "failed", "Required result output directory was unavailable")
		return
	}

	fmt.Println("job completed.")
	if err := c.CompleteJob(job.JobID, "done", ""); err != nil {
		fmt.Println("couldn't report completion:", err)
	}
}

// uploadOutput looks for a single file in the container's output mount and
// uploads it, if present. Best-effort: a job that produced no file (most
// jobs — this is only for image/video-generation-shaped work) or an upload
// that fails doesn't fail the job itself, since the actual work already
// completed successfully by this point.
func uploadOutput(c *client.AgentClient, job *client.AgentJob, outputDir string) error {
	entries, err := os.ReadDir(outputDir)
	if err != nil || len(entries) == 0 {
		if job.Result.Required {
			return fmt.Errorf("workload produced no result")
		}
		return nil
	}
	name := entries[0].Name()
	path := filepath.Join(outputDir, name)
	info, err := os.Lstat(path)
	if err != nil || !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
		fmt.Println("refusing non-regular job output")
		return fmt.Errorf("workload produced a non-regular result")
	}
	if info.Size() > job.Result.MaxBytes {
		fmt.Printf("refusing oversized job output (%d bytes)\n", info.Size())
		return fmt.Errorf("result exceeds %d bytes", job.Result.MaxBytes)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		fmt.Println("couldn't read job output file:", err)
		return err
	}

	contentType := mime.TypeByExtension(filepath.Ext(name))
	switch strings.ToLower(filepath.Ext(name)) {
	case ".json":
		contentType = "application/json"
	case ".zip":
		contentType = "application/zip"
	case ".png":
		contentType = "image/png"
	case ".jpg", ".jpeg":
		contentType = "image/jpeg"
	case ".webp":
		contentType = "image/webp"
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	fmt.Printf("uploading job output %s (%s, %d bytes)...\n", name, contentType, len(data))
	if err := c.UploadArtifact(job.JobID, contentType, data); err != nil {
		return err
	}
	return nil
}

func materializeInputs(c *client.AgentClient, job *client.AgentJob) (string, error) {
	if len(job.Inputs) == 0 {
		return "", nil
	}
	dir, err := os.MkdirTemp("", "decompute-input-*")
	if err != nil {
		return "", err
	}
	for i, input := range job.Inputs {
		data, err := c.DownloadInput(job.JobID, input)
		if err != nil {
			os.RemoveAll(dir)
			return "", err
		}
		name := filepath.Base(input.Filename)
		if name == "." || name == "" {
			name = fmt.Sprintf("input-%03d.bin", i+1)
		}
		if err := os.WriteFile(filepath.Join(dir, fmt.Sprintf("%03d-%s", i+1, name)), data, 0o600); err != nil {
			os.RemoveAll(dir)
			return "", err
		}
	}
	return dir, nil
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
