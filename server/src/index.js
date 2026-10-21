import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import "dotenv/config";
import "express-async-errors"; // lets async route handlers throw into the error handler below
import { authRouter } from "./routes/auth.js";
import { paymentsRouter, stripeWebhookHandler } from "./routes/payments.js";
import { payoutsRouter } from "./routes/payouts.js";
import { jobsRouter, outputsRouter } from "./routes/jobs.js";
import { nodesRouter } from "./routes/nodes.js";
import { agentRouter } from "./routes/agent.js";
import { reapStuckJobs } from "./lib/jobReaper.js";
import { settleDeferredJobs } from "./lib/jobSettlement.js";
import { incidentModeEnabled } from "./lib/incidentMode.js";
import { purgeExpiredData } from "./lib/dataRetention.js";
import { videoRouter, videoAgentRouter } from "./routes/video.js";
import { runVideoQueue } from "./lib/video/runtime.js";

const app = express();

// Cloud Run (and every other reverse-proxy host) terminates TLS and forwards
// the real client IP via X-Forwarded-For. Without this, Express falls back
// to the proxy's own IP for every request, so express-rate-limit collapses
// all callers into one shared bucket — a handful of retries from one user
// then 429s everyone. `1` trusts exactly one hop (the platform's load
// balancer), not arbitrary client-supplied forwarding chains.
app.set("trust proxy", 1);

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:5173" }));

// Stripe webhook needs the raw, unparsed body to verify its signature — it
// must be registered with its own raw-body middleware before the global
// express.json() below, or the signature check silently fails.
app.post("/api/payments/webhook", express.raw({ type: "application/json" }), stripeWebhookHandler);

app.use(express.json());

// Strict only where passwords are tried. The signed-in site re-reads
// /api/auth/me every 30 s to keep the balance current, which alone would
// exhaust a 20-per-15-minutes budget in ten minutes and sign people out.
const credentialLimiter = rateLimit({ windowMs: 15 * 60_000, max: 20, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 15 * 60_000, max: 300, standardHeaders: true, legacyHeaders: false });
const moneyLimiter = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false });
const nodesLimiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });
// The agent polls heartbeat every ~15s per node plus bursts of heartbeat/log
// batches while a job runs — generous, but still a real ceiling per node.
// Counted per agent (its bearer token), not per IP: volunteers in one home,
// or cloud machines behind one NAT address, share an IP but are separate
// computers, and would otherwise throttle each other.
const agentLimiter = rateLimit({
  windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => {
    const auth = String(req.headers.authorization || "");
    return auth ? `agent:${crypto.createHash("sha256").update(auth).digest("hex")}` : `ip:${req.ip}`;
  },
});

app.get("/health", (req, res) => res.json({ ok: true, acceptingJobs: !incidentModeEnabled(), incidentMode: incidentModeEnabled() }));
app.use(["/api/auth/signup", "/api/auth/login", "/api/auth/login-email", "/api/auth/login-message"], credentialLimiter);
app.use("/api/auth", authLimiter, authRouter);
app.use("/api/payments", moneyLimiter, paymentsRouter);
app.use("/api/payouts", moneyLimiter, payoutsRouter);
// jobsRouter applies its own limiters per-route (a strict one on the two
// mutating routes, a more generous one on the polling GETs) rather than a
// single router-wide limiter — LiveJobView polls two GET routes every 3s,
// which alone exceeds moneyLimiter's 20/min if applied router-wide.
app.use("/api/jobs", jobsRouter);
app.use("/api/outputs", outputsRouter);
app.use("/api/nodes", nodesLimiter, nodesRouter);
app.use("/api/agent", agentLimiter, agentRouter);
app.use("/api/video/agent", agentLimiter, videoAgentRouter);
app.use("/api/video", videoRouter);

app.use((req, res) => res.status(404).json({ error: "Not found" }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong" });
});

const REAP_INTERVAL_MS = 60_000;
setInterval(() => runVideoQueue().catch((err) => console.error("Video queue failed:", err.message)), 10_000);
setInterval(() => {
  reapStuckJobs().catch((err) => console.error("Job reaper failed:", err));
  settleDeferredJobs().catch((err) => console.error("Deferred settlement sweep failed:", err));
  purgeExpiredData().catch((err) => console.error("Data retention sweep failed:", err));
}, REAP_INTERVAL_MS);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Decompute backend listening on http://localhost:${port}`);
  reapStuckJobs().catch((err) => console.error("Job reaper failed:", err)); // don't wait a full interval for the first sweep
  settleDeferredJobs().catch((err) => console.error("Deferred settlement sweep failed:", err));
});
