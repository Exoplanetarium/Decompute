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

func TestDockingStaysOfflineEvenAsALocalBuild(t *testing.T) {
	t.Setenv("DECOMPUTE_WORKLOAD_IMAGES", "")
	policy, err := Resolve("molecular-docking", "decompute/docking:local")
	if err != nil {
		t.Fatal(err)
	}
	if policy.NetworkAccess {
		t.Fatal("docking bakes its receptor into the image and must run with --network=none")
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

func TestConfiguredImageReportsOnlyEnabledVideoWorkloads(t *testing.T) {
	t.Setenv("DECOMPUTE_WORKLOAD_IMAGES", "")
	if _, err := ConfiguredImage("video-generation"); err == nil {
		t.Fatal("video must stay disabled until the provider configures its pinned image")
	}
	image := "registry.example/video@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
	t.Setenv("DECOMPUTE_WORKLOAD_IMAGES", `{"video-generation":"`+image+`"}`)
	got, err := ConfiguredImage("video-generation")
	if err != nil || got != image {
		t.Fatalf("ConfiguredImage = %q, %v", got, err)
	}
	policy, err := Resolve("video-generation", image)
	if err != nil || policy.NetworkAccess || policy.MemoryLimit != "48g" {
		t.Fatalf("video policy = %+v, %v; want offline with a 48g memory ceiling", policy, err)
	}
	if _, err := Resolve("video-generation", "registry.example/video:latest"); err == nil {
		t.Fatal("expected a substituted video image to be rejected")
	}
}
