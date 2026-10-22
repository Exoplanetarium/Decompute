// Re-checks every docking result before the server accepts it. The checker
// is verify.py (job-templates/docking), served over HTTP by verify_server.py
// as its own private Cloud Run service: it re-scores each returned pose with
// the same Vina and receptor the volunteers use, and confirms the reported
// score matches and the pose sits inside the docking box. It runs on our side
// rather than on a volunteer's computer, since that's the computer being
// checked.
//
// DOCKING_VERIFIER_URL unset means no checking (local development without
// the verifier container running).

const VERIFIER_URL = (process.env.DOCKING_VERIFIER_URL || "").replace(/\/+$/, "");
const VERIFY_TIMEOUT_MS = 120_000;

export class VerifierUnavailableError extends Error {}

export function verifierConfigured() {
  return VERIFIER_URL !== "";
}

// On Cloud Run, the server's service account proves who it is to the private
// verifier with an identity token from the metadata server. Off Cloud Run
// there is no metadata server, and a local verifier needs no token.
async function identityToken(audience) {
  try {
    const res = await fetch(
      `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}`,
      { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(2_000) }
    );
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

// Every docked molecule must have been checked and must have passed. One
// faked score rejects the whole chunk: it goes back in the queue for a
// different computer, and this one isn't paid for it.
export function summarizeVerification(items, dockedCount) {
  const checked = Array.isArray(items) ? items : [];
  const failed = checked.filter((item) => item?.ok !== true);
  const gaps = checked
    .map((item) => Math.abs(Number(item?.reported) - Number(item?.rescored)))
    .filter(Number.isFinite);
  const maxScoreGap = gaps.length ? Math.round(Math.max(...gaps) * 1000) / 1000 : 0;
  if (checked.length !== dockedCount) {
    return { ok: false, reason: `Verifier checked ${checked.length} of ${dockedCount} docked molecules` };
  }
  if (failed.length) {
    return {
      ok: false,
      reason: `${failed.length} of ${checked.length} molecules failed re-scoring (index ${failed.slice(0, 10).map((i) => i?.index).join(", ")})`,
    };
  }
  return { ok: true, checked: checked.length, maxScoreGap };
}

export async function verifyDockingResult(data, dockedCount) {
  const headers = { "Content-Type": "application/json" };
  const token = await identityToken(VERIFIER_URL);
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(`${VERIFIER_URL}/verify`, {
      method: "POST", headers, body: data, signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
  } catch (err) {
    throw new VerifierUnavailableError(`Verifier unreachable: ${err.message}`);
  }
  const body = await res.json().catch(() => ({}));
  // 400 is the verifier's verdict on the result itself (a pose Vina can't
  // read); anything else non-OK is the verifier's own problem.
  if (res.status === 400) return { ok: false, reason: String(body.error || "Result couldn't be verified").slice(0, 500) };
  if (!res.ok) throw new VerifierUnavailableError(`Verifier returned ${res.status}`);
  return summarizeVerification(body.items, dockedCount);
}
