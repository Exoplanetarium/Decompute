package client

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"testing"
	"time"
)

func signedTestJob(t *testing.T, token string) *signedJob {
	t.Helper()
	job := AgentJob{
		Version: 2, JobID: "job-1", NodeID: "node-1", InputHash: "abc",
		ExpiresAt: time.Now().Add(time.Minute),
	}
	job.Execution.WorkloadID = "image-generation"
	job.Execution.DockerImage = "decompute/image-gen:local"
	job.Execution.GPUsNeeded = 1
	job.Execution.MaxRuntimeHours = 0.25
	job.Result.Schema = "decompute.image.v1"
	payload, err := json.Marshal(job)
	if err != nil {
		t.Fatal(err)
	}
	mac := hmac.New(sha256.New, []byte(token))
	mac.Write(payload)
	return &signedJob{Manifest: payload, Signature: base64.RawURLEncoding.EncodeToString(mac.Sum(nil))}
}

func TestVerifyJobAcceptsValidManifest(t *testing.T) {
	token := "node-1.secret"
	client := NewAgentClient("http://localhost", token)
	job, err := client.verifyJob(signedTestJob(t, token))
	if err != nil {
		t.Fatal(err)
	}
	if job.Execution.WorkloadID != "image-generation" {
		t.Fatalf("unexpected workload %q", job.Execution.WorkloadID)
	}
}

func TestVerifyJobRejectsTampering(t *testing.T) {
	token := "node-1.secret"
	client := NewAgentClient("http://localhost", token)
	manifest := signedTestJob(t, token)
	manifest.Manifest = append(manifest.Manifest, ' ')
	if _, err := client.verifyJob(manifest); err == nil {
		t.Fatal("expected tampered manifest to be rejected")
	}
}
