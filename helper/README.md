# Decompute Helper

A small CLI that detects your machine's real GPU, RAM, and CPU and reports
them back to Decompute so your listing shows accurate specs. It runs once
and exits — it isn't a background service.

## Usage

```
decompute-helper --code YOUR_PAIRING_CODE
```

Get a pairing code from the "List your GPU" flow in the browser first —
it's only valid for 15 minutes and can only be used once. If you omit
`--code`, the binary prompts for it.

## Building

Requires Go 1.22+.

```
make build-all   # windows/mac(intel+arm)/linux binaries into dist/, pointed at prod
make build-dev    # same, pointed at http://localhost:3000 for local testing
```

## Publishing new binaries

Binaries are hosted in a Cloudflare R2 bucket bound to `get.decompute.io`
(free egress at this scale — see repo root README for the one-time R2/DNS
setup in the Cloudflare dashboard). Publishing a new build uses `rclone`:

```
# One-time setup — get these three values from Cloudflare dashboard →
# R2 → Manage API Tokens → Create API Token:
rclone config
# name: r2
# type: s3
# provider: Cloudflare
# access_key_id / secret_access_key: from the token you created
# endpoint: https://<account-id>.r2.cloudflarestorage.com
```

Then, after `make build-all`:

```
make upload
```

This uploads everything in `dist/` to the bucket; files already at
`get.decompute.io/<filename>` are overwritten in place, so a re-run after
a rebuild just replaces the old binaries — no version bump needed unless
you want one.

## Note on OS security warnings

These binaries aren't code-signed yet, so Windows SmartScreen and macOS
Gatekeeper will warn on first run ("Windows protected your PC" / "cannot be
opened because the developer cannot be verified"). Click through
"More info -> Run anyway" (Windows) or right-click -> Open (macOS) once to
proceed. Signing is planned for a later pass, not this one.
