//go:build windows

package detect

import (
	"encoding/json"
	"os/exec"
	"strconv"
	"strings"
)

// Prefers nvidia-smi when present, since it reports real VRAM — WMI's
// AdapterRAM caps at ~4GB on some older drivers. WMI (via PowerShell CIM
// cmdlets) is the fallback for non-NVIDIA cards.
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

	out, err := exec.Command("powershell", "-NoProfile", "-Command",
		"Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM | ConvertTo-Json").Output()
	if err != nil {
		return "", "", 0, 0
	}

	type gpuRow struct {
		Name       string
		AdapterRAM float64
	}
	var rows []gpuRow

	var raw interface{}
	if err := json.Unmarshal(out, &raw); err != nil {
		return "", "", 0, 0
	}
	switch v := raw.(type) {
	case []interface{}:
		b, _ := json.Marshal(v)
		json.Unmarshal(b, &rows)
	case map[string]interface{}:
		b, _ := json.Marshal(v)
		var single gpuRow
		json.Unmarshal(b, &single)
		rows = []gpuRow{single}
	}
	if len(rows) == 0 {
		return "", "", 0, 0
	}
	return "unknown", rows[0].Name, len(rows), rows[0].AdapterRAM / (1024 * 1024 * 1024)
}

func ramGB() float64 {
	out, err := exec.Command("powershell", "-NoProfile", "-Command",
		"(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory").Output()
	if err != nil {
		return 0
	}
	bytes, _ := strconv.ParseFloat(strings.TrimSpace(string(out)), 64)
	return bytes / (1024 * 1024 * 1024)
}

func cpuInfo() string {
	out, err := exec.Command("powershell", "-NoProfile", "-Command",
		"(Get-CimInstance Win32_Processor).Name").Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}
