import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import "dotenv/config";
import "express-async-errors"; // lets async route handlers throw into the error handler below
import { authRouter } from "./routes/auth.js";
import { paymentsRouter, stripeWebhookHandler } from "./routes/payments.js";
import { jobsRouter } from "./routes/jobs.js";
import { nodesRouter } from "./routes/nodes.js";

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:5173" }));

// Stripe webhook needs the raw, unparsed body to verify its signature — it
// must be registered with its own raw-body middleware before the global
// express.json() below, or the signature check silently fails.
app.post("/api/payments/webhook", express.raw({ type: "application/json" }), stripeWebhookHandler);

app.use(express.json());

const authLimiter = rateLimit({ windowMs: 15 * 60_000, max: 20, standardHeaders: true, legacyHeaders: false });
const moneyLimiter = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false });
const nodesLimiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });

app.get("/health", (req, res) => res.json({ ok: true }));
app.use("/api/auth", authLimiter, authRouter);
app.use("/api/payments", moneyLimiter, paymentsRouter);
app.use("/api/jobs", moneyLimiter, jobsRouter);
app.use("/api/nodes", nodesLimiter, nodesRouter);

app.use((req, res) => res.status(404).json({ error: "Not found" }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong" });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Decompute backend listening on http://localhost:${port}`));
