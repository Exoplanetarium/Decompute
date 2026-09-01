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
}

var known = map[string]Policy{
	// This trusted development template downloads model weights on first use,
	// so it temporarily needs egress. Production templates should bake weights
	// into their image and change this policy to false.
	"image-generation": {Image: "decompute/image-gen:local", NetworkAccess: true},
	"llm-finetune":     {NetworkAccess: false},
	"train-classifier": {NetworkAccess: false},
	"transcribe-audio": {NetworkAccess: false},
	"video-generation": {NetworkAccess: false},
}

func Resolve(id, requestedImage string) (Policy, error) {
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
			if id == "image-generation" {
				// Only the local stand-in downloads weights at runtime. A pinned
				// production image is expected to contain everything it needs.
				policy.NetworkAccess = image == "decompute/image-gen:local"
			}
		}
	}

	if policy.Image == "" {
		return Policy{}, fmt.Errorf("workload %q is not enabled by this provider", id)
	}
	if requestedImage != policy.Image {
		return Policy{}, fmt.Errorf("workload %q requested unauthorized image %q", id, requestedImage)
	}
	return policy, nil
}
