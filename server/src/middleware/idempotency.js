import { query } from "../db.js";

// Optional per-route dedup keyed on a client-supplied `Idempotency-Key` header
// (mirrors the one-time-use pattern wallet_nonces uses for wallet sign-in).
// If a request with the same (user, route, key) already ran, its recorded
// response is replayed instead of re-executing the handler — so a network
// retry or a double-click can't double-charge a card or double-submit a job.
// Requires requireAuth to run first (needs req.userId).
export function idempotent(routeName) {
  return async function (req, res, next) {
    const key = req.headers["idempotency-key"];
    if (!key) return next();

    const existing = await query(
      `SELECT response_status, response_body FROM idempotency_keys WHERE user_id = $1 AND route = $2 AND key = $3`,
      [req.userId, routeName, key]
    );
    if (existing.rows[0]) {
      return res.status(existing.rows[0].response_status).json(existing.rows[0].response_body);
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      query(
        `INSERT INTO idempotency_keys (key, user_id, route, response_status, response_body)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
        [key, req.userId, routeName, res.statusCode, JSON.stringify(body)]
      ).catch((err) => console.error("Failed to record idempotency key:", err.message));
      return originalJson(body);
    };
    next();
  };
}
