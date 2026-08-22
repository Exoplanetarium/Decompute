//go:build darwin

package detect

import (
	"encoding/json"
	"os/exec"
	"strconv"
	"strings"
)

func gpuInfo() (vendor, model string, count int, vramGB float64) {
	out, err := exec.Command("system_profiler", "SPDisplaysDataType", "-json").Output()
	if err != nil {
		return "", "", 0, 0
	}

	var parsed struct {
		SPDisplaysDataType []struct {
			Model string `json:"sppci_model"`
			VRAM  string `json:"spdisplays_vram"`
		} `json:"SPDisplaysDataType"`
	}
	if err := json.Unmarshal(out, &parsed); err != nil || len(parsed.SPDisplaysDataType) == 0 {
		return "", "", 0, 0
	}

	card := parsed.SPDisplaysDataType[0]
	count = len(parsed.SPDisplaysDataType)

	if card.VRAM != "" {
		// Discrete GPU, e.g. "8 GB".
		fields := strings.Fields(card.VRAM)
		if len(fields) > 0 {
			gb, _ := strconv.ParseFloat(fields[0], 64)
			return "discrete", card.Model, count, gb
		}
	}

	// Apple Silicon: unified memory has no separate VRAM figure — it's
	// already counted in system RAM, so don't double-count it here.
	if strings.Contains(strings.ToLower(card.Model), "apple") {
		return "apple", card.Model, count, 0
	}

	return "unknown", card.Model, count, 0
}

func ramGB() float64 {
	out, err := exec.Command("sysctl", "-n", "hw.memsize").Output()
	if err != nil {
		return 0
	}
	bytes, _ := strconv.ParseFloat(strings.TrimSpace(string(out)), 64)
	return bytes / (1024 * 1024 * 1024)
}

func cpuInfo() string {
	out, err := exec.Command("sysctl", "-n", "machdep.cpu.brand_string").Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}
