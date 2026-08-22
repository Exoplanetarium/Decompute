//go:build linux

package detect

import (
	"bufio"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
)

func gpuInfo() (vendor, model string, count int, vramGB float64) {
	if out, err := exec.Command("nvidia-smi", "--query-gpu=name,memory.total,count", "--format=csv,noheader,nounits").Output(); err == nil {
		lines := strings.Split(strings.TrimSpace(string(out)), "\n")
		if len(lines) > 0 && lines[0] != "" {
			fields := strings.Split(lines[0], ",")
			if len(fields) >= 2 {
				name := strings.TrimSpace(fields[0])
				memMB, _ := strconv.ParseFloat(strings.TrimSpace(fields[1]), 64)
				return "nvidia", name, len(lines), memMB / 1024
			}
		}
	}

	// Fallback for non-NVIDIA (mainly AMD): VRAM straight from sysfs, model
	// string from lspci.
	if matches, _ := filepath.Glob("/sys/class/drm/card*/device/mem_info_vram_total"); len(matches) > 0 {
		if data, err := os.ReadFile(matches[0]); err == nil {
			bytes, _ := strconv.ParseFloat(strings.TrimSpace(string(data)), 64)
			vramGB = bytes / (1024 * 1024 * 1024)
		}
	}

	if out, err := exec.Command("lspci", "-mm").Output(); err == nil {
		scanner := bufio.NewScanner(strings.NewReader(string(out)))
		for scanner.Scan() {
			line := scanner.Text()
			lower := strings.ToLower(line)
			if strings.Contains(lower, "vga") || strings.Contains(lower, "3d controller") {
				model = line
				count++
			}
		}
	}

	if model == "" {
		return "", "", 0, 0
	}
	return "unknown", model, count, vramGB
}

func ramGB() float64 {
	data, err := os.ReadFile("/proc/meminfo")
	if err != nil {
		return 0
	}
	scanner := bufio.NewScanner(strings.NewReader(string(data)))
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "MemTotal:") {
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				kb, _ := strconv.ParseFloat(fields[1], 64)
				return kb / (1024 * 1024)
			}
		}
	}
	return 0
}

func cpuInfo() string {
	data, err := os.ReadFile("/proc/cpuinfo")
	if err != nil {
		return ""
	}
	scanner := bufio.NewScanner(strings.NewReader(string(data)))
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "model name") {
			parts := strings.SplitN(line, ":", 2)
			if len(parts) == 2 {
				return strings.TrimSpace(parts[1])
			}
		}
	}
	return ""
}
