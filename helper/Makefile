API_BASE ?= https://api.decompute.io

# R2 upload config — set these in your shell env or a local .env you source
# yourself, never commit them. R2_REMOTE is the rclone remote name you set
# up once with `rclone config` (see README.md).
R2_REMOTE ?= r2
R2_BUCKET ?= decompute-helper

.PHONY: build-all build-dev build-windows build-darwin-amd64 build-darwin-arm64 build-linux clean upload

build-all: build-windows build-darwin-amd64 build-darwin-arm64 build-linux

build-windows:
	GOOS=windows GOARCH=amd64 go build -ldflags "-X main.defaultAPIBase=$(API_BASE)" -o dist/decompute-helper-windows-amd64.exe .

build-darwin-amd64:
	GOOS=darwin GOARCH=amd64 go build -ldflags "-X main.defaultAPIBase=$(API_BASE)" -o dist/decompute-helper-darwin-amd64 .

build-darwin-arm64:
	GOOS=darwin GOARCH=arm64 go build -ldflags "-X main.defaultAPIBase=$(API_BASE)" -o dist/decompute-helper-darwin-arm64 .

build-linux:
	GOOS=linux GOARCH=amd64 go build -ldflags "-X main.defaultAPIBase=$(API_BASE)" -o dist/decompute-helper-linux-amd64 .

build-dev: API_BASE=http://localhost:3000
build-dev: build-all

clean:
	rm -rf dist

# Publishes whatever's currently in dist/ to the R2 bucket behind
# get.decompute.io. Run `make build-all` first — this doesn't rebuild.
upload:
	rclone copy dist/ $(R2_REMOTE):$(R2_BUCKET) --progress
