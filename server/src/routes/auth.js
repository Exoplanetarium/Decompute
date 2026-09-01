import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { ethers } from "ethers";
import { query } from "../db.js";
import { signToken } from "../lib/jwt.js";
import { toUserDto } from "../lib/userDto.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const authRouter = Router();

authRouter.post("/signup", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const displayName = req.body?.displayName ? String(req.body.displayName).trim() : null;

  if (!email || !password) return res.status(400).json({ error: "Email and password required" });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

  const existing = await query("SELECT id FROM users WHERE email = $1", [email]);
  if (existing.rows.length) return res.status(409).json({ error: "An account with that email already exists" });

  const passwordHash = await bcrypt.hash(password, 12);
  const result = await query(
    `INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id`,
    [email, passwordHash, displayName]
  );

  const token = signToken(result.rows[0].id);
  res.status(201).json({ token });
});

authRouter.post("/login-email", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });

  const result = await query("SELECT id, password_hash FROM users WHERE email = $1", [email]);
  const row = result.rows[0];
  if (!row || !row.password_hash) return res.status(401).json({ error: "Incorrect email or password" });

  const valid = await bcrypt.compare(password, row.password_hash);
  if (!valid) return res.status(401).json({ error: "Incorrect email or password" });

  res.json({ token: signToken(row.id) });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const result = await query("SELECT * FROM users WHERE id = $1", [req.userId]);
  const row = result.rows[0];
  if (!row) return res.status(401).json({ error: "Account no longer exists" });
  res.json(toUserDto(row));
});

// The only user-editable setting so far — whether the stuck-job reaper
// (server/src/lib/jobReaper.js) should auto-resubmit a job it just refunded,
// vs. leaving it for the renter to retry manually. Defaults off.
authRouter.patch("/me", requireAuth, async (req, res) => {
  if (req.body?.autoRetryFailedJobs === undefined) {
    return res.status(400).json({ error: "Nothing to update" });
  }
  const result = await query(
    `UPDATE users SET auto_retry_failed_jobs = $1 WHERE id = $2 RETURNING *`,
    [!!req.body.autoRetryFailedJobs, req.userId]
  );
  res.json(toUserDto(result.rows[0]));
});

// Step 1 of wallet sign-in: issue a one-time nonce for the wallet to sign.
authRouter.post("/login-message", async (req, res) => {
  const wallet = String(req.body?.wallet || "").toLowerCase();
  if (!wallet) return res.status(400).json({ error: "Wallet address required" });

  const nonce = crypto.randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await query(
    `INSERT INTO wallet_nonces (wallet, nonce, expires_at) VALUES ($1, $2, $3)
     ON CONFLICT (wallet) DO UPDATE SET nonce = $2, expires_at = $3`,
    [wallet, nonce, expiresAt]
  );

  res.json({
    message: `Sign this message to log in to Decompute.\n\nNonce: ${nonce}`,
  });
});

// Step 2: verify the signature matches the wallet that requested the nonce.
authRouter.post("/login", async (req, res) => {
  const wallet = String(req.body?.wallet || "").toLowerCase();
  const signature = req.body?.signature;
  if (!wallet || !signature) return res.status(400).json({ error: "Wallet and signature required" });

  const nonceRow = (await query("SELECT nonce, expires_at FROM wallet_nonces WHERE wallet = $1", [wallet])).rows[0];
  if (!nonceRow || new Date(nonceRow.expires_at) < new Date()) {
    return res.status(401).json({ error: "Sign-in request expired — try again" });
  }

  const message = `Sign this message to log in to Decompute.\n\nNonce: ${nonceRow.nonce}`;
  let recovered;
  try {
    recovered = ethers.verifyMessage(message, signature).toLowerCase();
  } catch {
    return res.status(401).json({ error: "Invalid signature" });
  }
  if (recovered !== wallet) return res.status(401).json({ error: "Signature does not match wallet" });

  await query("DELETE FROM wallet_nonces WHERE wallet = $1", [wallet]);

  let userRow = (await query("SELECT * FROM users WHERE wallet = $1", [wallet])).rows[0];
  let welcome = "Welcome back!";
  if (!userRow) {
    const inserted = await query(
      `INSERT INTO users (wallet) VALUES ($1) RETURNING *`,
      [wallet]
    );
    userRow = inserted.rows[0];
    welcome = "Welcome to Decompute!";
  }

  res.json({ token: signToken(userRow.id), user: toUserDto(userRow), welcome });
});
