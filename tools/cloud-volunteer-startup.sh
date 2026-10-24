#!/bin/bash
# Boot script for a cloud "volunteer" (see cloud-volunteers.ps1): turns a
# fresh Ubuntu VM into a contributing computer by running the same helper
# command a person pastes from the Contribute page. Runs on every boot.
set -u
HELPER=us-central1-docker.pkg.dev/decompute-508417/decompute-public/helper:v5
DOCKING=us-central1-docker.pkg.dev/decompute-508417/decompute-public/docking@sha256:d9fdc99240960e5e8f102308db5a9c58112258000723e77479d1083c1b2b08e5

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi

# Already set up on an earlier boot: Docker restarts the helper by itself
# (--restart unless-stopped), and it resumes its saved setup.
if docker ps -a --format '{{.Names}}' | grep -qx decompute; then
  docker start decompute
  exit 0
fi

# Download both images now, so the first chunk doesn't wait on a 1-2 GB pull.
docker pull "$HELPER"
docker pull --platform linux/amd64 "$DOCKING"

# The setup code arrives later in instance metadata: codes are single-use and
# a new one cancels the last, so cloud-volunteers.ps1 hands them out one
# machine at a time.
MD=http://metadata.google.internal/computeMetadata/v1/instance/attributes/decompute-setup
until CODE=$(curl -sf -H 'Metadata-Flavor: Google' "$MD"); do sleep 5; done

docker run -d --name decompute --restart unless-stopped \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v decompute-config:/config -v decompute-work:/work \
  "$HELPER" --setup "$CODE"
