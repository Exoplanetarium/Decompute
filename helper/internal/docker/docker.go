// Package docker runs job containers. No hardening beyond --rm --gpus all
// plus the caller's context deadline — no network egress restriction, no
// seccomp/AppArmor profile, no cgroup limits beyond what --gpus/the
// timeout provide. That's a real, deferred gap (see helper/README.md).
package docker

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"
)

// Available reports whether the Docker CLI can reach a running daemon.
func Available() bool {
	return exec.Command("docker", "info").Run() == nil
}

// SetupGuidance explains what to install. The agent refuses to start
// rather than attempting to install Docker Desktop/Engine unattended —
// that needs admin rights and often a reboot, out of scope here.
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

// LogLine is one line of container stdout/stderr.
type LogLine struct {
	Msg string
}

// Run executes `docker run --rm --gpus all -e K=V... <image>`, streaming
// combined stdout+stderr to lines. ctx's deadline is the only enforcement
// of the job's max runtime — exec.CommandContext kills the process when it
// expires. Identical arguments on Linux and Windows: Docker Desktop's
// WSL2 backend exposes the same --gpus flag as Docker Engine, matching how
// detect_linux.go/detect_windows.go already both resolve plain "nvidia-smi"
// on PATH rather than branching per OS.
//
// When outputDir is non-empty, it's bind-mounted at /output — the only
// channel a container has for returning a file rather than just log text.
// The caller reads whatever landed there after Run returns.
//
// Also always mounts a persistent, node-local cache at
// /root/.cache/huggingface — without it, a --rm container that pulls model
// weights from Hugging Face (image/video-generation-shaped templates) would
// re-download several GB on every single job. Harmless no-op for images
// that never touch that path.
func Run(ctx context.Context, image string, env map[string]string, outputDir string, lines chan<- LogLine) error {
	args := []string{"run", "--rm", "--gpus", "all"}
	if outputDir != "" {
		args = append(args, "-v", outputDir+":/output")
	}
	if dir, err := hfCacheDir(); err == nil {
		args = append(args, "-v", dir+":/root/.cache/huggingface")
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

	var wg sync.WaitGroup
	wg.Add(2)
	go streamLines(&wg, stdout, lines)
	go streamLines(&wg, stderr, lines)

	waitErr := cmd.Wait()
	wg.Wait()
	return waitErr
}

func hfCacheDir() (string, error) {
	base, err := os.UserCacheDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(base, "decompute-agent", "hf-cache")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	return dir, nil
}

func streamLines(wg *sync.WaitGroup, r io.Reader, lines chan<- LogLine) {
	defer wg.Done()
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)
	for scanner.Scan() {
		lines <- LogLine{Msg: scanner.Text()}
	}
}
