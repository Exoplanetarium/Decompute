// Agent-mode calls to /api/agent/*, authenticated with a node's persistent
// agent token rather than the one-shot pairing code ReportSpec (client.go)
// uses — this credential authenticates a process that runs indefinitely,
// not a single report.
package client

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// AgentJob is what the backend hands the agent to run — mirrors
// agentJobDto in server/src/routes/agent.js.
type AgentJob struct {
	Version   int       `json:"version"`
	JobID     string    `json:"jobId"`
	NodeID    string    `json:"nodeId"`
	Attempt   int       `json:"attempt"`
	IssuedAt  time.Time `json:"issuedAt"`
	ExpiresAt time.Time `json:"expiresAt"`
	Seed      uint32    `json:"seed"`
	InputHash string    `json:"inputHash"`
	Execution struct {
		WorkloadID      string            `json:"workloadId"`
		DockerImage     string            `json:"dockerImage"`
		ModelID         string            `json:"modelId"`
		CacheKey        string            `json:"cacheKey"`
		GPUsNeeded      int               `json:"gpusNeeded"`
		MaxRuntimeHours float64           `json:"maxRuntimeHours"`
		EnvVars         map[string]string `json:"envVars"`
	} `json:"execution"`
	Inputs []JobInput      `json:"inputs"`
	Result JobResultPolicy `json:"result"`
}

type JobInput struct {
	ID          string `json:"id"`
	Filename    string `json:"filename"`
	ContentType string `json:"contentType"`
	ByteSize    int64  `json:"byteSize"`
	SHA256      string `json:"sha256"`
}

type JobResultPolicy struct {
	Schema              string   `json:"schema"`
	Required            bool     `json:"required"`
	MaxBytes            int64    `json:"maxBytes"`
	AllowedContentTypes []string `json:"allowedContentTypes"`
}

type Benchmark struct {
	Version      string  `json:"version"`
	GPUScore     float64 `json:"gpuScore,omitempty"`
	DownloadMbps float64 `json:"downloadMbps,omitempty"`
	UploadMbps   float64 `json:"uploadMbps,omitempty"`
}

type Capabilities struct {
	CachedModels []string  `json:"cachedModels"`
	Benchmark    Benchmark `json:"benchmark"`
}

type signedJob struct {
	Manifest  json.RawMessage `json:"manifest"`
	Signature string          `json:"signature"`
}

type LogLine struct {
	Level string `json:"level"`
	Msg   string `json:"msg"`
}

type HeartbeatSample struct {
	GPUUsagePct float64 `json:"gpuUsagePct"`
	VRAMUsedGB  float64 `json:"vramUsedGb"`
}

type AgentClient struct {
	apiBase string
	token   string
	http    *http.Client
}

func NewAgentClient(apiBase, token string) *AgentClient {
	return &AgentClient{apiBase: apiBase, token: token, http: &http.Client{Timeout: 15 * time.Second}}
}

func (c *AgentClient) BenchmarkNetwork() (downloadMbps, uploadMbps float64) {
	const size = 256 * 1024
	getURL := c.apiBase + "/api/agent/benchmark"
	req, _ := http.NewRequest(http.MethodGet, getURL, nil)
	req.Header.Set("Authorization", "Bearer "+c.token)
	start := time.Now()
	resp, err := c.http.Do(req)
	if err == nil {
		data, readErr := io.ReadAll(io.LimitReader(resp.Body, size+1))
		resp.Body.Close()
		if readErr == nil && resp.StatusCode < 300 && len(data) == size {
			downloadMbps = float64(size*8) / time.Since(start).Seconds() / 1_000_000
		}
	}
	payload := bytes.Repeat([]byte{0x5a}, size)
	req, _ = http.NewRequest(http.MethodPost, getURL, bytes.NewReader(payload))
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Content-Type", "application/octet-stream")
	start = time.Now()
	resp, err = c.http.Do(req)
	if err == nil {
		io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
		if resp.StatusCode < 300 {
			uploadMbps = float64(size*8) / time.Since(start).Seconds() / 1_000_000
		}
	}
	return
}

func (c *AgentClient) do(method, path string, body, out interface{}) error {
	var reader io.Reader
	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(payload)
	}

	url := c.apiBase + path
	req, err := http.NewRequest(method, url, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return &connError{url: url, cause: err}
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		snippet, _ := io.ReadAll(io.LimitReader(resp.Body, 300))
		return &statusError{url: url, status: resp.StatusCode, body: strings.TrimSpace(string(snippet))}
	}
	if out != nil {
		return json.NewDecoder(resp.Body).Decode(out)
	}
	return nil
}

// Heartbeat reports liveness and returns the node's current job, if any —
// one combined call rather than two independent poll loops for what is
// conceptually one "what should I be doing" question.
func (c *AgentClient) Heartbeat(capabilities Capabilities) (*AgentJob, error) {
	var out struct {
		Data struct {
			Job *signedJob `json:"job"`
		} `json:"data"`
	}
	if err := c.do(http.MethodPost, "/api/agent/heartbeat", struct {
		Capabilities Capabilities `json:"capabilities"`
	}{capabilities}, &out); err != nil {
		return nil, err
	}
	if out.Data.Job == nil {
		return nil, nil
	}
	return c.verifyJob(out.Data.Job)
}

func (c *AgentClient) verifyJob(signed *signedJob) (*AgentJob, error) {
	provided, err := base64.RawURLEncoding.DecodeString(signed.Signature)
	if err != nil {
		return nil, errors.New("job manifest has an invalid signature encoding")
	}
	mac := hmac.New(sha256.New, []byte(c.token))
	mac.Write(signed.Manifest)
	if !hmac.Equal(provided, mac.Sum(nil)) {
		return nil, errors.New("job manifest signature verification failed")
	}
	var job AgentJob
	if err := json.Unmarshal(signed.Manifest, &job); err != nil {
		return nil, fmt.Errorf("job manifest is invalid: %w", err)
	}
	nodeID, _, ok := strings.Cut(c.token, ".")
	if !ok || job.NodeID != nodeID {
		return nil, errors.New("job manifest was issued for a different node")
	}
	now := time.Now()
	if job.ExpiresAt.Before(now) || job.ExpiresAt.After(now.Add(2*time.Minute)) {
		return nil, errors.New("job manifest is expired or has an invalid lifetime")
	}
	if job.Version != 2 || job.JobID == "" || job.Execution.WorkloadID == "" || job.Execution.DockerImage == "" ||
		job.Execution.GPUsNeeded < 1 || job.Execution.GPUsNeeded > 16 ||
		job.Execution.MaxRuntimeHours <= 0 || job.Execution.MaxRuntimeHours > 72 ||
		job.InputHash == "" || job.Result.Schema == "" {
		return nil, errors.New("job manifest failed validation")
	}
	return &job, nil
}

func (c *AgentClient) DownloadInput(jobID string, input JobInput) ([]byte, error) {
	url := c.apiBase + "/api/agent/job/" + jobID + "/input/" + input.ID
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, &connError{url: url, cause: err}
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("input download returned status %d", resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, input.ByteSize+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) != input.ByteSize {
		return nil, errors.New("downloaded input size does not match manifest")
	}
	digest := sha256.Sum256(data)
	if fmt.Sprintf("%x", digest) != input.SHA256 {
		return nil, errors.New("downloaded input SHA-256 does not match manifest")
	}
	return data, nil
}

func (c *AgentClient) ClaimJob(jobID string) error {
	return c.do(http.MethodPost, "/api/agent/job/"+jobID+"/claim", struct{}{}, nil)
}

func (c *AgentClient) PostHeartbeats(jobID string, samples []HeartbeatSample) error {
	body := struct {
		Samples []HeartbeatSample `json:"samples"`
	}{Samples: samples}
	return c.do(http.MethodPost, "/api/agent/job/"+jobID+"/heartbeats", body, nil)
}

func (c *AgentClient) PostLogs(jobID string, lines []LogLine) error {
	body := struct {
		Lines []LogLine `json:"lines"`
	}{Lines: lines}
	return c.do(http.MethodPost, "/api/agent/job/"+jobID+"/logs", body, nil)
}

// UploadArtifact sends a job's output file, read off the container's
// mounted /output directory, as a raw body — not JSON, so this bypasses
// do() and sets Content-Type to the artifact's own type directly.
func (c *AgentClient) UploadArtifact(jobID, contentType string, data []byte) error {
	url := c.apiBase + "/api/agent/job/" + jobID + "/artifact"
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(data))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	// Keep the transport opaque so the API's global JSON parser cannot alter
	// structured result bytes before their SHA-256 is verified.
	req.Header.Set("Content-Type", "application/octet-stream")
	req.Header.Set("X-Decompute-Result-Content-Type", contentType)
	digest := sha256.Sum256(data)
	req.Header.Set("X-Decompute-Sha256", fmt.Sprintf("%x", digest))

	resp, err := c.http.Do(req)
	if err != nil {
		return &connError{url: url, cause: err}
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		snippet, _ := io.ReadAll(io.LimitReader(resp.Body, 300))
		return &statusError{url: url, status: resp.StatusCode, body: strings.TrimSpace(string(snippet))}
	}
	return nil
}

func (c *AgentClient) CompleteJob(jobID, status, errorMessage string) error {
	body := struct {
		Status       string `json:"status"`
		ErrorMessage string `json:"errorMessage,omitempty"`
	}{Status: status, ErrorMessage: errorMessage}
	return c.do(http.MethodPost, "/api/agent/job/"+jobID+"/complete", body, nil)
}

type connError struct {
	url   string
	cause error
}

func (e *connError) Error() string {
	return "couldn't reach Decompute at " + e.url + "\n  cause: " + e.cause.Error() + "\n  " + hintFor(e.cause)
}
func (e *connError) Unwrap() error { return e.cause }

type statusError struct {
	url    string
	status int
	body   string
}

func (e *statusError) Error() string {
	msg := "Decompute returned an error (status " + strconv.Itoa(e.status) + ") from " + e.url
	if e.body != "" {
		msg += "\n  " + e.body
	}
	return msg
}
