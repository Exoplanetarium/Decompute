package agent

import (
	"fmt"
	"os/exec"
	"strconv"
	"strings"
)

// sampleGPU shells out to nvidia-smi for the first GPU's current
// utilization and VRAM usage. Same command on Linux and Windows — both
// already resolve "nvidia-smi" via PATH in the one-shot detection code
// (internal/detect/detect_linux.go, detect_windows.go).
func sampleGPU() (usagePct, vramUsedGB float64, err error) {
	out, err := exec.Command("nvidia-smi", "--query-gpu=utilization.gpu,memory.used", "--format=csv,noheader,nounits").Output()
	if err != nil {
		return 0, 0, err
	}
	line := strings.TrimSpace(strings.Split(string(out), "\n")[0])
	fields := strings.Split(line, ",")
	if len(fields) < 2 {
		return 0, 0, fmt.Errorf("unexpected nvidia-smi output: %q", line)
	}
	usagePct, _ = strconv.ParseFloat(strings.TrimSpace(fields[0]), 64)
	vramUsedMB, _ := strconv.ParseFloat(strings.TrimSpace(fields[1]), 64)
	return usagePct, vramUsedMB / 1024, nil
}
