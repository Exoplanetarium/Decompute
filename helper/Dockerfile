# The helper as a container, so volunteers paste one `docker run` command
# instead of opening a downloaded .exe (which Windows Smart App Control blocks
# outright when it's unsigned). It drives the host's Docker through the
# mounted socket, so job containers run as its siblings.
#
# Multi-platform: the helper itself runs natively on amd64 and arm64 (Apple
# Silicon, Snapdragon Windows). Workload images stay amd64 and are emulated
# on ARM (see docker.WorkloadPlatform). Build the two binaries first, then:
#   docker buildx build --platform linux/amd64,linux/arm64 -t <image> --push .
FROM docker:27.5.1-cli

ARG TARGETARCH
COPY dist/decompute-helper-linux-${TARGETARCH} /usr/local/bin/decompute-helper
RUN mkdir -p /work /config

# Container mode: run in the foreground, resume the saved setup on restart,
# and share job directories through the decompute-work volume. These names
# must match the `docker run` command the website shows.
ENV DECOMPUTE_IN_CONTAINER=1 \
    DECOMPUTE_WORK_DIR=/work \
    DECOMPUTE_WORK_VOLUME=decompute-work \
    TMPDIR=/work \
    XDG_CONFIG_HOME=/config

ENTRYPOINT ["decompute-helper"]
