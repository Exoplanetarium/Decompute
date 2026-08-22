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

Binaries are hosted as GitHub Release assets on this repo
(`Exoplanetarium/Decompute`) — free, no domain or hosting account needed.
The app always downloads from the release's `/releases/latest/download/`
alias (see `HELPER_BASE` in `src/App.jsx`), so whatever release is most
recent (and not marked pre-release) is automatically what sellers get.

Requires the [GitHub CLI](https://cli.github.com/) (`gh`), authenticated
once with `gh auth login`.

```
make build-all
make release VERSION=v1.0.1
```

Each publish is a new tagged release rather than overwriting files in
place — bump `VERSION` each time (e.g. `v1.0.2`). Old releases stay
available at their own tag if you ever need to roll back.

## Note on OS security warnings

These binaries aren't code-signed yet, so Windows SmartScreen and macOS
Gatekeeper will warn on first run ("Windows protected your PC" / "cannot be
opened because the developer cannot be verified"). Click through
"More info -> Run anyway" (Windows) or right-click -> Open (macOS) once to
proceed. Signing is planned for a later pass, not this one.
