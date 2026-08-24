// Agent-mode calls to /api/agent/*, authenticated with a node's persistent
// agent token rather than the one-shot pairing code ReportSpec (client.go)
// uses — this credential authenticates a process that runs indefinitely,
// not a single report.
package client

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// AgentJob is what the backend hands the agent to run — mirrors
// agentJobDto in server/src/routes/agent.js.
type AgentJob struct {
	ID              string            `json:"id"`
	DockerImage     string            `json:"dockerImage"`
	GPUsNeeded      int               `json:"gpusNeeded"`
	EnvVars         map[string]string `json:"envVars"`
	MaxRuntimeHours float64           `json:"maxRuntimeHours"`
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
func (c *AgentClient) Heartbeat() (*AgentJob, error) {
	var out struct {
		Data struct {
			Job *AgentJob `json:"job"`
		} `json:"data"`
	}
	if err := c.do(http.MethodPost, "/api/agent/heartbeat", struct{}{}, &out); err != nil {
		return nil, err
	}
	return out.Data.Job, nil
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
	req.Header.Set("Content-Type", contentType)

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
