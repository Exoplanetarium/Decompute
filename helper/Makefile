API_BASE ?= https://api.decompute.io
REPO ?= Exoplanetarium/Decompute

.PHONY: build-all build-dev build-windows build-darwin-amd64 build-darwin-arm64 build-linux clean release

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

# Publishes whatever's currently in dist/ as a new GitHub Release. The app
# always downloads via the "latest" alias, so a new release here is
# immediately what sellers get — nothing else to update.
# Usage: make release VERSION=v1.0.1  (run `make build-all` first)
release:
	@test -n "$(VERSION)" || (echo "Usage: make release VERSION=v1.0.1"; exit 1)
	gh release create $(VERSION) dist/* --repo $(REPO) --title "Helper $(VERSION)" --notes "Decompute helper binaries $(VERSION)"
