// Package client reports a detected Spec to the Decompute backend. This
// runs unauthenticated, on the seller's own machine — the pairing code is
// the only credential.
package client

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/decompute/helper/internal/detect"
)

// ErrInvalidCode is returned when the backend rejects the pairing code as
// unknown or expired (HTTP 404 from POST /api/nodes/detect).
var ErrInvalidCode = errors.New("pairing code is invalid or has expired")

type detectRequest struct {
	Code     string `json:"code"`
	OS       string `json:"os"`
	Hostname string `json:"hostname"`
	GPU      struct {
		Vendor string  `json:"vendor"`
		Model  string  `json:"model"`
		Count  int     `json:"count"`
		VRAMGB float64 `json:"vramGb"`
	} `json:"gpu"`
	RAM struct {
		TotalGB float64 `json:"totalGb"`
	} `json:"ram"`
	CPU struct {
		Model string `json:"model"`
		Cores int    `json:"cores"`
	} `json:"cpu"`
}

func ReportSpec(apiBase, code string, spec detect.Spec) error {
	body := detectRequest{Code: code, OS: spec.OS, Hostname: spec.Hostname}
	body.GPU.Vendor = spec.GPUVendor
	body.GPU.Model = spec.GPUModel
	body.GPU.Count = spec.GPUCount
	body.GPU.VRAMGB = spec.VRAMGB
	body.RAM.TotalGB = spec.RAMGB
	body.CPU.Model = spec.CPUModel
	body.CPU.Cores = spec.CPUCores

	payload, err := json.Marshal(body)
	if err != nil {
		return err
	}

	httpClient := &http.Client{Timeout: 15 * time.Second}
	resp, err := httpClient.Post(apiBase+"/api/nodes/detect", "application/json", bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("couldn't reach Decompute — check your internet connection")
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return ErrInvalidCode
	}
	if resp.StatusCode >= 300 {
		return fmt.Errorf("unexpected response from Decompute (status %d)", resp.StatusCode)
	}
	return nil
}
