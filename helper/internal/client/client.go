// Package client reports a detected Spec to the Decompute backend. This
// runs unauthenticated, on the seller's own machine — the pairing code is
// the only credential.
package client

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"syscall"
	"time"

	"github.com/decompute/helper/internal/detect"
	"github.com/decompute/helper/internal/readiness"
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
	// Reported alongside hardware so the browser can gate listing setup on
	// real local checks from this same run, instead of a second process.
	Readiness readiness.Result `json:"readiness"`
}

func ReportSpec(apiBase, code string, spec detect.Spec, ready readiness.Result) error {
	body := detectRequest{Code: code, OS: spec.OS, Hostname: spec.Hostname, Readiness: ready}
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

	url := apiBase + "/api/nodes/detect"
	httpClient := &http.Client{Timeout: 15 * time.Second}
	resp, err := httpClient.Post(url, "application/json", bytes.NewReader(payload))
	if err != nil {
		// Always surface the address and the underlying cause. A bare
		// "check your internet connection" hides the difference between a
		// DNS failure, a refused connection, and a VPN/proxy intercept —
		// which makes this impossible to diagnose from the message alone.
		return fmt.Errorf("couldn't reach Decompute at %s\n  cause: %w\n  %s", url, err, hintFor(err))
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return ErrInvalidCode
	}
	if resp.StatusCode >= 300 {
		snippet, _ := io.ReadAll(io.LimitReader(resp.Body, 300))
		return fmt.Errorf("Decompute returned an error (status %d) from %s\n  %s", resp.StatusCode, url, strings.TrimSpace(string(snippet)))
	}
	return nil
}

// hintFor turns a transport error into the next thing worth trying, since
// the three common causes need three different fixes.
func hintFor(err error) string {
	var dnsErr *net.DNSError
	if errors.As(err, &dnsErr) {
		return "That address doesn't resolve. If you're testing against a local server, pass --api-base http://localhost:3000 (or whatever port it's on)."
	}
	// Windows reports WSAECONNREFUSED rather than the Unix errno, and it
	// doesn't always compare equal, so match the message too.
	if errors.Is(err, syscall.ECONNREFUSED) || strings.Contains(strings.ToLower(err.Error()), "refused") {
		return "Nothing is listening there. Make sure the Decompute backend is running on that address."
	}
	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return "The connection timed out. A VPN or proxy (e.g. Cloudflare WARP) may be intercepting it — try disabling it and running again."
	}
	return "Check that the address is correct and reachable from this machine."
}

// EnrollAgent redeems a one-time code (from the listing's "done" screen)
// for the node's real agent credential — the long-lived secret is minted
// fresh on the backend and only ever transmitted here, never typed by hand.
func EnrollAgent(apiBase, code string) (nodeID, secret string, err error) {
	payload, err := json.Marshal(struct {
		Code string `json:"code"`
	}{Code: code})
	if err != nil {
		return "", "", err
	}

	url := apiBase + "/api/nodes/agent-enroll"
	httpClient := &http.Client{Timeout: 15 * time.Second}
	resp, err := httpClient.Post(url, "application/json", bytes.NewReader(payload))
	if err != nil {
		return "", "", fmt.Errorf("couldn't reach Decompute at %s\n  cause: %w\n  %s", url, err, hintFor(err))
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return "", "", ErrInvalidCode
	}
	if resp.StatusCode >= 300 {
		snippet, _ := io.ReadAll(io.LimitReader(resp.Body, 300))
		return "", "", fmt.Errorf("Decompute returned an error (status %d) from %s\n  %s", resp.StatusCode, url, strings.TrimSpace(string(snippet)))
	}

	var out struct {
		Data struct {
			NodeID     string `json:"nodeId"`
			AgentToken string `json:"agentToken"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", "", fmt.Errorf("Decompute sent back a response we couldn't understand: %w", err)
	}
	dot := strings.IndexByte(out.Data.AgentToken, '.')
	if dot < 0 {
		return "", "", errors.New("Decompute sent back an invalid agent token")
	}
	return out.Data.NodeID, out.Data.AgentToken[dot+1:], nil
}

// Setup is the one-command path (`--setup CODE`): it sends this computer's
// hardware report with the code the website showed, and the server registers
// the computer right away and returns its agent credential. ErrNotReady
// means the report was recorded but a prerequisite (Docker) is missing.
func Setup(apiBase, code string, spec detect.Spec, ready readiness.Result) (nodeID, secret, name string, err error) {
	body := detectRequest{Code: code, OS: spec.OS, Hostname: spec.Hostname, Readiness: ready}
	body.GPU.Vendor = spec.GPUVendor
	body.GPU.Model = spec.GPUModel
	body.GPU.Count = spec.GPUCount
	body.GPU.VRAMGB = spec.VRAMGB
	body.RAM.TotalGB = spec.RAMGB
	body.CPU.Model = spec.CPUModel
	body.CPU.Cores = spec.CPUCores
	payload, err := json.Marshal(body)
	if err != nil {
		return "", "", "", err
	}

	url := apiBase + "/api/nodes/setup"
	httpClient := &http.Client{Timeout: 30 * time.Second}
	resp, err := httpClient.Post(url, "application/json", bytes.NewReader(payload))
	if err != nil {
		return "", "", "", fmt.Errorf("couldn't reach Decompute at %s\n  cause: %w\n  %s", url, err, hintFor(err))
	}
	defer resp.Body.Close()

	switch {
	case resp.StatusCode == http.StatusNotFound:
		return "", "", "", ErrInvalidCode
	case resp.StatusCode == http.StatusConflict:
		return "", "", "", ErrNotReady
	case resp.StatusCode >= 300:
		snippet, _ := io.ReadAll(io.LimitReader(resp.Body, 300))
		return "", "", "", fmt.Errorf("Decompute returned an error (status %d) from %s\n  %s", resp.StatusCode, url, strings.TrimSpace(string(snippet)))
	}

	var out struct {
		Data struct {
			NodeID     string `json:"nodeId"`
			Name       string `json:"name"`
			AgentToken string `json:"agentToken"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", "", "", fmt.Errorf("Decompute sent back a response we couldn't understand: %w", err)
	}
	dot := strings.IndexByte(out.Data.AgentToken, '.')
	if dot < 0 {
		return "", "", "", errors.New("Decompute sent back an invalid agent token")
	}
	return out.Data.AgentToken[:dot], out.Data.AgentToken[dot+1:], out.Data.Name, nil
}

// ErrNotReady is returned by Setup when this computer is missing a
// prerequisite; the website shows which one.
var ErrNotReady = errors.New("this computer isn't ready yet")
