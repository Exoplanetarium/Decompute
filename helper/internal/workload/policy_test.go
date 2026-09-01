package workload

import "testing"

func TestResolveRejectsImageSubstitution(t *testing.T) {
	t.Setenv("DECOMPUTE_WORKLOAD_IMAGES", "")
	if _, err := Resolve("image-generation", "attacker/image:latest"); err == nil {
		t.Fatal("expected substituted image to be rejected")
	}
}

func TestResolveAcceptsExactCuratedImage(t *testing.T) {
	t.Setenv("DECOMPUTE_WORKLOAD_IMAGES", "")
	policy, err := Resolve("image-generation", "decompute/image-gen:local")
	if err != nil {
		t.Fatal(err)
	}
	if !policy.NetworkAccess {
		t.Fatal("development image needs network access for its first model download")
	}
}

func TestResolveUsesOperatorOverride(t *testing.T) {
	image := "registry.example/image@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	t.Setenv("DECOMPUTE_WORKLOAD_IMAGES", `{"image-generation":"`+image+`"}`)
	policy, err := Resolve("image-generation", image)
	if err != nil {
		t.Fatal(err)
	}
	if policy.NetworkAccess {
		t.Fatal("production image should default to network-disabled")
	}
}
