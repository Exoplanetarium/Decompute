import bcrypt from "bcryptjs";
import { query } from "../db.js";

// The agent token is "<nodeId>.<secret>" — the node id is an indexed
// lookup key, the secret is what's actually checked against the stored
// bcrypt hash. Unlike requireAuth's JWT, this credential never expires;
// it's rotated (server/src/routes/nodes.js POST /:id/agent-token), not
// reissued per session, since it authenticates an unattended process.
export async function requireAgentAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const dot = token ? token.indexOf(".") : -1;
  if (!token || dot < 0) return res.status(401).json({ error: "Missing or invalid agent token" });

  const nodeId = token.slice(0, dot);
  const secret = token.slice(dot + 1);

  const { rows } = await query(`SELECT agent_token_hash FROM nodes WHERE id = $1`, [nodeId]);
  const row = rows[0];
  if (!row?.agent_token_hash || !(await bcrypt.compare(secret, row.agent_token_hash))) {
    return res.status(401).json({ error: "Invalid agent token" });
  }

  req.nodeId = nodeId;
  next();
}
