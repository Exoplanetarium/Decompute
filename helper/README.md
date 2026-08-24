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
`--code`, the binary prompts for it, so double-clicking the file and
pasting the code works with no terminal knowledge.

### Where it reports

By default the helper reports to the API baked in at build time
(`-X main.defaultAPIBase`, production for released binaries). A pairing
code can override that by carrying the server that minted it:

```
A1B2C3D4                    → the build-time default
A1B2C3D4@localhost:3000     → http://localhost:3000
A1B2C3D4@staging.example.com → https://staging.example.com
```

Loopback and private addresses get `http`, everything else `https`;
an explicit `@http://host` scheme is honored as given. The browser emits
this longer form automatically whenever the app isn't pointed at
production, which is what keeps the paste-the-code flow working in dev
without anyone needing `--api-base`. A code is only valid on the server
that issued it, so an embedded host wins over `--api-base`.

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
