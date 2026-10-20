// Package workload is the provider-controlled execution allowlist. Even a
// malformed or compromised API response cannot make the agent execute an
// image unless its workload ID and exact image reference match this policy.
package workload

import (
	"encoding/json"
	"fmt"
	"os"
)

type Policy struct {
	Image         string
	NetworkAccess bool
	ModelID       string
	MemoryLimit   string
}

var known = map[string]Policy{
	// This trusted development template downloads model weights on first use,
	// so it temporarily needs egress. Production templates should bake weights
	// into their image and change this policy to false.
	"image-generation": {Image: "decompute/image-gen:local", NetworkAccess: true, ModelID: "CompVis/stable-diffusion-v1-4"},
	"llm-finetune":     {NetworkAccess: false},
	"train-classifier": {NetworkAccess: false},
	"transcribe-audio": {Image: "decompute/transcribe:local", NetworkAccess: true, ModelID: "Systran/faster-whisper-small"},
	"text-embeddings":  {Image: "decompute/embeddings:local", NetworkAccess: true, ModelID: "sentence-transformers/all-MiniLM-L6-v2"},
	// The receptor and docking engine are baked into the image; it never
	// needs egress, even the local build.
	"molecular-docking": {Image: "decompute/docking:local", NetworkAccess: false},
	"video-generation":  {NetworkAccess: false, ModelID: "Wan-AI/Wan2.2-TI2V-5B-Diffusers", MemoryLimit: "48g"},
	// FastVideo's 3-step distillation of the same model; same memory envelope.
	"video-generation-fast": {NetworkAccess: false, ModelID: "FastVideo/FastWan2.2-TI2V-5B-FullAttn-Diffusers", MemoryLimit: "48g"},
	"video-reference":       {NetworkAccess: false, ModelID: "stabilityai/stable-diffusion-xl-base-1.0", MemoryLimit: "24g"},
}

// VideoWorkloads are prepared ahead of time (see agent.PrepareVideo): their
// images carry tens of GB of weights, and a video attempt refuses to download
// anything on the clock.
var VideoWorkloads = []string{"video-reference", "video-generation", "video-generation-fast"}

func Resolve(id, requestedImage string) (Policy, error) {
	policy, err := configured(id)
	if err != nil {
		return Policy{}, err
	}
	if requestedImage != policy.Image {
		return Policy{}, fmt.Errorf("workload %q requested unauthorized image %q", id, requestedImage)
	}
	return policy, nil
}

// ConfiguredImage is the image this provider has enabled for a workload,
// for preparing it before any server asks for it.
func ConfiguredImage(id string) (string, error) {
	policy, err := configured(id)
	return policy.Image, err
}

func configured(id string) (Policy, error) {
	policy, ok := known[id]
	if !ok {
		return Policy{}, fmt.Errorf("workload %q is not recognized by this agent", id)
	}

	if raw := os.Getenv("DECOMPUTE_WORKLOAD_IMAGES"); raw != "" {
		var configured map[string]string
		if err := json.Unmarshal([]byte(raw), &configured); err != nil {
			return Policy{}, fmt.Errorf("DECOMPUTE_WORKLOAD_IMAGES is invalid JSON: %w", err)
		}
		if image := configured[id]; image != "" {
			policy.Image = image
			if id == "image-generation" || id == "transcribe-audio" || id == "text-embeddings" {
				// Only the local stand-in downloads weights at runtime. A pinned
				// production image is expected to contain everything it needs.
				policy.NetworkAccess = image == "decompute/image-gen:local"
			}
		}
	}

	if policy.Image == "" {
		return Policy{}, fmt.Errorf("workload %q is not enabled by this provider", id)
	}
	return policy, nil
}
