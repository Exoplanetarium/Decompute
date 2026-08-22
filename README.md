# Decompute

A decentralized AI compute marketplace. Rent GPU power from providers worldwide,
or earn money sharing your own.

---

## ⚡ Run it in 3 commands

You need **Node.js 18 or newer** ([get it here](https://nodejs.org) if you don't have it).

```bash
npm install
npm run dev
```

That's it. Your browser opens automatically at **http://localhost:5173**

> First `npm install` takes ~30 seconds. After that, startup is instant.

---

## 🎭 It runs standalone — no backend needed

The app works immediately in **demo mode**. You'll see an amber dot in the header
that says `DEMO` — that means it's running with realistic sample data instead of
a live backend. Everything is clickable and explorable.

To connect a real backend later, see [Connecting a backend](#-connecting-a-backend) below.

---

## 👀 What to try first

The app opens in **Simple Mode** — the friendly view built for people who don't
know what a GPU is.

**In Simple Mode (default):**
1. **Create tab** — "What would you like to make?" Pick any card (🎨 Generate images
   is the fastest) and walk through the flow.
2. Try the **"✨ Help me describe it better"** button on the prompt — it improves
   your wording so you get a better result.
3. **My Stuff tab** — where your creations collect, with share buttons.

**Switch to Advanced Mode** (the 🌱 Simple pill in the header) to see the full
product:
- **Marketplace** — browse GPU nodes with live specs, prices, and AI match scores
- **Models** — a community marketplace where people publish fine-tuned models
- **My Jobs** — running jobs with progress, GPU utilization, and AI insights
- **Provider Hub** — the flow for listing your own GPU and earning
- **Pricing** — honest cost comparison vs AWS, RunPod, Lambda
- **Network** — global telemetry and the security/trust model

**Other things worth finding:**
- Press **⌘K** (or **Ctrl+K**) anywhere for the command palette
- The **✦ button** bottom-right opens the AI Copilot
- Resize your window narrow (or open on your phone) to see the mobile layout —
  the dev server prints a Network URL you can open on a phone on the same wifi

---

## 📁 What's in here

```
decompute/
├── index.html          Entry HTML + social share tags
├── package.json        Dependencies and scripts
├── vite.config.js      Dev server config
├── .env.example        Backend URL config (copy to .env when needed)
├── helper/             Go CLI sellers run to report real GPU/RAM/CPU specs
└── src/
    ├── main.jsx        React mount point
    └── App.jsx         The entire app (~6,400 lines, single file)
```

The whole app is one file (`src/App.jsx`) by design — easy to read top to bottom,
easy to drop into any React project, no import maze.

---

## 🛠 Commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start the dev server with hot reload |
| `npm run build` | Build for production into `dist/` |
| `npm run preview` | Preview the production build locally |

---

## 🔌 Connecting a backend

The app talks to a backend if one is available, and falls back to demo data if not.

1. Copy the env file:
   ```bash
   cp .env.example .env
   ```
2. Set your backend URL in `.env`:
   ```
   VITE_API_BASE=http://localhost:3000
   ```
3. Restart the dev server (`Ctrl+C`, then `npm run dev`)

The header dot turns **green (LIVE)** when it connects.

The backend lives in `decompute-backend.tar.gz` — see its README for setup
(it needs PostgreSQL). You do **not** need it to explore the frontend.

---

## 🖥 Seller hardware detection (Provider Hub → Easy setup)

Sellers listing a GPU run a small Go binary (`helper/`) that reports their
real GPU/VRAM/RAM/CPU back to the backend via a short-lived pairing code —
see `helper/README.md` for how it detects hardware per OS and how to build
it (`make build-all` from `helper/`, requires Go 1.22+).

The frontend links to the compiled binaries at `VITE_HELPER_BINARY_BASE_URL`
(defaults to `https://get.decompute.io`) — set it in `.env` if you're
hosting them somewhere else.

---

## 🚀 Deploying

```bash
npm run build          # outputs to dist/
```

Then drag `dist/` onto [Netlify Drop](https://app.netlify.com/drop), or:

```bash
npm i -g vercel && vercel
```

Full production guide (backend, database, storage, payments, domain) is in
`decompute-deploy-kit.tar.gz` → `DEPLOY_COMPLETE.md`.

---

## ❓ Troubleshooting

**`command not found: npm`**
Node.js isn't installed. Get it at [nodejs.org](https://nodejs.org) (pick the LTS version).

**Port 5173 already in use**
```bash
npm run dev -- --port 3001
```

**Browser doesn't open automatically**
Just visit http://localhost:5173 yourself.

**Blank page**
Open your browser's developer console (F12) and check for errors. Most often this
means the `npm install` didn't finish — try running it again.

**It says DEMO and I expected live data**
That's correct without a backend. See [Connecting a backend](#-connecting-a-backend).
