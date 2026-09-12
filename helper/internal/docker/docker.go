// Package docker runs curated workload containers with a restrictive default
// sandbox. Docker is still not a perfect VM boundary, especially with GPU
// passthrough, but jobs do not receive a privileged general-purpose runtime.
package docker

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
)

func Available() bool {
	return exec.Command("docker", "info").Run() == nil
}

func SetupGuidance() string {
	if runtime.GOOS == "windows" {
		return "Docker wasn't found. Install Docker Desktop with the WSL2 backend, plus the\n" +
			"NVIDIA driver's WSL/CUDA support, then run this again:\n" +
			"  https://docs.docker.com/desktop/setup/install/windows-install/\n" +
			"  https://docs.nvidia.com/cuda/wsl-user-guide/index.html"
	}
	return "Docker wasn't found. Install Docker Engine and the NVIDIA Container Toolkit,\n" +
		"then run this again:\n" +
		"  https://docs.docker.com/engine/install/\n" +
		"  https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html"
}

type LogLine struct {
	Msg string
}

// Pull fetches an image ahead of the timed run in Run below. Docker would
// pull on demand anyway, but that happens inside the job's paid runtime
// budget, where a multi-gigabyte first download can consume the whole
// allowance. Already-present images make this a fast no-op.
func Pull(ctx context.Context, image string) error {
	cmd := exec.CommandContext(ctx, "docker", "pull", image)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%w: %s", err, strings.TrimSpace(string(output)))
	}
	return nil
}

// Run executes one image that has already passed the provider-controlled
// workload allowlist. It uses a non-root UID, a read-only root filesystem,
// dropped capabilities, cgroup limits, and no network unless that specific
// curated workload requires it.
func Run(ctx context.Context, jobID, cacheKey, image string, gpuCount int, networkAccess bool, env map[string]string, inputDir, outputDir string, lines chan<- LogLine) error {
	containerName := "decompute-job-" + safeName(jobID)
	containerUser := containerIdentity()
	memoryLimit := envOr("DECOMPUTE_JOB_MEMORY_LIMIT", "12g")
	cpuLimit := envOr("DECOMPUTE_JOB_CPU_LIMIT", "4")
	args := []string{
		"run", "--rm", "--name", containerName,
		"--gpus", fmt.Sprintf("count=%d", gpuCount),
		"--cap-drop=ALL",
		"--security-opt=no-new-privileges:true",
		"--read-only",
		"--pids-limit=512",
		"--memory", memoryLimit,
		"--memory-swap", memoryLimit,
		"--cpus", cpuLimit,
		"--ulimit", "nofile=1024:1024",
		"--tmpfs", "/tmp:rw,nosuid,noexec,size=2g",
		"--user", containerUser,
		// containerUser is frequently a numeric UID with no /etc/passwd entry
		// in the image (e.g. the 65532 fallback used on every non-Linux
		// Docker host — Windows and macOS Docker Desktop VMs included).
		// Python's getpass.getuser() checks these env vars before ever
		// falling back to a passwd lookup; without them, anything that calls
		// it deep in an import chain (observed: torch._inductor's cache-dir
		// setup, imported transitively by diffusers/transformers) crashes
		// the job with "getpwuid(): uid not found" before it does any work.
		"-e", "USER=decompute",
		"-e", "LOGNAME=decompute",
	}
	if !networkAccess {
		args = append(args, "--network=none")
	}
	if outputDir != "" {
		if err := prepareWritableDir(outputDir, containerUser); err != nil {
			return fmt.Errorf("prepare output sandbox: %w", err)
		}
		args = append(args, "-v", outputDir+":/output:rw")
	}
	if inputDir != "" {
		args = append(args, "-v", inputDir+":/input:ro")
	}
	if dir, err := HFCacheDir(cacheKey, containerUser); err == nil {
		args = append(args,
			"-v", dir+":/cache/huggingface:rw",
			"-e", "HF_HOME=/cache/huggingface",
			"-e", "TORCH_HOME=/cache/huggingface/torch",
			"-e", "HOME=/tmp",
			"-e", "XDG_CACHE_HOME=/tmp/cache",
		)
	}
	for k, v := range env {
		args = append(args, "-e", fmt.Sprintf("%s=%s", k, v))
	}
	args = append(args, image)

	cmd := exec.CommandContext(ctx, "docker", args...)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return err
	}
	if err := cmd.Start(); err != nil {
		return err
	}
	// Killing the Docker CLI on timeout does not reliably kill the container
	// on every platform. Force-remove this exact, validated name after Wait.
	defer exec.Command("docker", "rm", "-f", containerName).Run()

	var wg sync.WaitGroup
	wg.Add(2)
	go streamLines(&wg, stdout, lines)
	go streamLines(&wg, stderr, lines)
	waitErr := cmd.Wait()
	wg.Wait()
	return waitErr
}

func HFCacheDir(cacheKey, containerUser string) (string, error) {
	base, err := os.UserCacheDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(base, "decompute-agent", "model-cache", safeName(cacheKey))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	if err := prepareWritableDir(dir, containerUser); err != nil {
		return "", err
	}
	return dir, nil
}

// Cached reports whether a model cache contains real files. Scheduling uses
// this as a warm-start hint only; it is never treated as a trust boundary.
func Cached(cacheKey string) bool {
	dir, err := HFCacheDir(cacheKey, containerIdentity())
	if err != nil {
		return false
	}
	found := false
	filepath.WalkDir(dir, func(_ string, entry os.DirEntry, err error) error {
		if err == nil && entry != nil && !entry.IsDir() {
			found = true
			return filepath.SkipAll
		}
		return nil
	})
	return found
}

// On Linux, using the agent account's own unprivileged uid/gid means bind
// mounts can stay private to that OS account. A root-run service instead uses
// the fixed nobody-like uid and chowns only its isolated job/cache directories.
func containerIdentity() string {
	if runtime.GOOS == "linux" {
		if current, err := user.Current(); err == nil && current.Uid != "0" && current.Uid != "" && current.Gid != "" {
			return current.Uid + ":" + current.Gid
		}
	}
	return "65532:65532"
}

func prepareWritableDir(path, identity string) error {
	if runtime.GOOS != "linux" {
		return nil // Docker Desktop mediates permissions for its Linux VM.
	}
	current, err := user.Current()
	if err == nil && identity == current.Uid+":"+current.Gid {
		return os.Chmod(path, 0o700)
	}
	var uid, gid int
	if _, err := fmt.Sscanf(identity, "%d:%d", &uid, &gid); err != nil {
		return err
	}
	if err := os.Chown(path, uid, gid); err != nil {
		return err
	}
	return os.Chmod(path, 0o700)
}

func safeName(value string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(value) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			b.WriteRune(r)
		}
	}
	if b.Len() == 0 {
		return "unknown"
	}
	return b.String()
}

func envOr(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func streamLines(wg *sync.WaitGroup, r io.Reader, lines chan<- LogLine) {
	defer wg.Done()
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)
	for scanner.Scan() {
		lines <- LogLine{Msg: scanner.Text()}
	}
}
