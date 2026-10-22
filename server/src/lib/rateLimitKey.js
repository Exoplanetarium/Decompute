import crypto from "node:crypto";

// Rate limits on the routes the site polls are counted per signed-in caller
// (a hash of their bearer token), not per IP: a school or home network puts
// many people behind one address, and per-IP limits there made everyone's
// open tabs throttle each other. Anonymous requests still count per IP.
export function callerKey(req) {
  const auth = String(req.headers.authorization || "");
  return auth ? `caller:${crypto.createHash("sha256").update(auth).digest("hex")}` : `ip:${req.ip}`;
}
