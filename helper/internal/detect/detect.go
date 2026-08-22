// Package detect probes the local machine for real GPU, RAM, and CPU specs.
// gpuInfo/ramGB/cpuInfo are implemented per OS in build-tagged files
// (detect_windows.go, detect_darwin.go, detect_linux.go); Detect is the
// only OS-agnostic entry point.
package detect

import (
	"os"
	"runtime"
)

type Spec struct {
	OS        string  `json:"os"`
	Hostname  string  `json:"hostname"`
	GPUVendor string  `json:"gpuVendor"`
	GPUModel  string  `json:"gpuModel"`
	GPUCount  int     `json:"gpuCount"`
	VRAMGB    float64 `json:"vramGb"`
	RAMGB     float64 `json:"ramGb"`
	CPUModel  string  `json:"cpuModel"`
	CPUCores  int     `json:"cpuCores"`
}

// runtime.GOOS values don't match the backend's os enum (darwin -> mac).
var osNames = map[string]string{"windows": "windows", "darwin": "mac", "linux": "linux"}

func Detect() Spec {
	hostname, _ := os.Hostname()

	vendor, model, count, vram := gpuInfo()
	if model == "" {
		vendor, model, count, vram = "unknown", "Unknown", 1, 0
	}

	return Spec{
		OS:        osNames[runtime.GOOS],
		Hostname:  hostname,
		GPUVendor: vendor,
		GPUModel:  model,
		GPUCount:  count,
		VRAMGB:    vram,
		RAMGB:     ramGB(),
		CPUModel:  cpuInfo(),
		CPUCores:  runtime.NumCPU(),
	}
}
