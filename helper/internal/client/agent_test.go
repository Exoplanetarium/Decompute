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
		ID: "job-1", NodeID: "node-1", WorkloadID: "image-generation",
		DockerImage: "decompute/image-gen:local", GPUsNeeded: 1,
		MaxRuntimeHours: 0.25, ExpiresAt: time.Now().Add(time.Minute),
	}
	payload, err := json.Marshal(job)
	if err != nil {
		t.Fatal(err)
	}
	manifest := base64.RawURLEncoding.EncodeToString(payload)
	mac := hmac.New(sha256.New, []byte(token))
	mac.Write([]byte(manifest))
	return &signedJob{Manifest: manifest, Signature: base64.RawURLEncoding.EncodeToString(mac.Sum(nil))}
}

func TestVerifyJobAcceptsValidManifest(t *testing.T) {
	token := "node-1.secret"
	client := NewAgentClient("http://localhost", token)
	job, err := client.verifyJob(signedTestJob(t, token))
	if err != nil {
		t.Fatal(err)
	}
	if job.WorkloadID != "image-generation" {
		t.Fatalf("unexpected workload %q", job.WorkloadID)
	}
}

func TestVerifyJobRejectsTampering(t *testing.T) {
	token := "node-1.secret"
	client := NewAgentClient("http://localhost", token)
	manifest := signedTestJob(t, token)
	manifest.Manifest += "A"
	if _, err := client.verifyJob(manifest); err == nil {
		t.Fatal("expected tampered manifest to be rejected")
	}
}
