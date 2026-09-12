// Package readiness runs local provider prerequisite checks — NVIDIA
// driver, Docker, and GPU container access — as part of the same one-shot
// hardware detection run, so the website never depends on a second,
// separately-started process to see them.
package readiness

import (
	"context"
	"fmt"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"github.com/decompute/helper/internal/detect"
)

type Check struct {
	ID      string `json:"id"`
	Label   string `json:"label"`
	Ready   bool   `json:"ready"`
	Detail  string `json:"detail"`
	Install string `json:"install"`
}

type Result struct {
	Ready  bool    `json:"ready"`
	Checks []Check `json:"checks"`
}

// CheckLocal runs each prerequisite check in order — hardware first, since
// there's no point telling someone to install Docker on a machine that
// can't run these jobs at all. report is called right after each check so
// a slow later step (the GPU container test can take a minute or more the
// first time, while it pulls a small CUDA image) never hides the earlier
// results behind silence.
func CheckLocal(spec detect.Spec, report func(Check)) Result {
	if report == nil {
		report = func(Check) {}
	}

	nvidiaReady := spec.GPUVendor == "nvidia" && commandWorks(5*time.Second, "nvidia-smi", "-L")
	gpuDetail := "No supported NVIDIA GPU driver was found."
	if nvidiaReady {
		gpuDetail = fmt.Sprintf("%d x %s with %.1f GB VRAM detected.", spec.GPUCount, spec.GPUModel, spec.VRAMGB)
	}
	nvidiaCheck := Check{ID: "nvidia", Label: "NVIDIA GPU and driver", Ready: nvidiaReady, Detail: gpuDetail, Install: "Install or update the NVIDIA driver, then run the helper again."}
	report(nvidiaCheck)

	dockerReady := commandWorks(5*time.Second, "docker", "info")
	dockerDetail := "Docker is not running or is unavailable."
	if dockerReady {
		dockerDetail = "Docker is running."
	}
	dockerCheck := Check{ID: "docker", Label: "Docker", Ready: dockerReady, Detail: dockerDetail, Install: dockerInstallInstruction()}
	report(dockerCheck)

	gpuContainerReady := false
	gpuContainerDetail := "Install NVIDIA Container Toolkit, or enable WSL 2 GPU support in Docker Desktop."
	if dockerReady && nvidiaReady {
		gpuContainerReady = commandWorks(2*time.Minute, "docker", "run", "--rm", "--gpus", "all", "nvidia/cuda:12.4.1-base-ubuntu22.04", "nvidia-smi", "-L")
		if gpuContainerReady {
			gpuContainerDetail = "Docker can access your NVIDIA GPU."
		} else {
			gpuContainerDetail = "Docker could not access the NVIDIA GPU. This check downloads a small CUDA image the first time — if that was still downloading, run it again."
		}
	}
	gpuContainerCheck := Check{ID: "gpu-container", Label: "GPU containers", Ready: gpuContainerReady, Detail: gpuContainerDetail, Install: gpuContainerInstallInstruction()}
	report(gpuContainerCheck)

	checks := []Check{nvidiaCheck, dockerCheck, gpuContainerCheck}
	return Result{Ready: nvidiaReady && dockerReady && gpuContainerReady, Checks: checks}
}

// commandWorks bounds every probe with a timeout — an unresponsive Docker
// daemon or a stalled image pull must not hang the helper forever.
func commandWorks(timeout time.Duration, name string, args ...string) bool {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	return exec.CommandContext(ctx, name, args...).Run() == nil
}

func dockerInstallInstruction() string {
	if runtime.GOOS == "windows" {
		return "Install Docker Desktop, select the WSL 2 backend, and start Docker Desktop."
	}
	return "Install and start Docker Engine."
}

func gpuContainerInstallInstruction() string {
	if runtime.GOOS == "windows" {
		return "Install the NVIDIA Windows driver with WSL CUDA support, then enable WSL 2 integration in Docker Desktop."
	}
	return "Install the NVIDIA Container Toolkit and restart Docker."
}

func Format(result Result) string {
	var lines []string
	for _, check := range result.Checks {
		state := "missing"
		if check.Ready {
			state = "ready"
		}
		lines = append(lines, fmt.Sprintf("%s: %s - %s", check.Label, state, check.Detail))
	}
	return strings.Join(lines, "\n")
}
