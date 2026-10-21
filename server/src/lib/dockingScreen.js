import crypto from "node:crypto";
import { query } from "../db.js";
import { getUserAccountId, getPlatformAccountId, postTransaction } from "./ledger.js";
import { deterministicSeed, hashInputs } from "./jobManifest.js";
import { JobMatchError } from "./jobMatching.js";
import { refreshNodeReliability } from "./jobSettlement.js";
import { incidentModeEnabled } from "./incidentMode.js";

// A docking screen is a work queue, not a set of jobs matched to nodes up
// front. Its library arrives as chunk files; each chunk becomes a child job
// with no node, and whichever computer is free claims the next one (see
// claimNextChunk, called from the agent heartbeat). Fast computers take more
// chunks, slow ones fewer, and a computer that joins mid-screen starts
// helping right away.
//
// Money works per molecule, not per hour: the renter's escrow is held once
// on the screen (parent) row when it's submitted, chunks carry no money of
// their own, and the screen settles once every chunk is finished. Each
// node owner is paid for the molecules their computers docked; what wasn't
// docked goes back to the renter. Settling once per screen rather than per
// chunk also keeps the 10% fee meaningful: a 20-molecule chunk is worth
// about a cent, and the ledger only records whole cents.

export const DOCKING_PRICE_PER_MOLECULE_USD = (() => {
  const configured = Number(process.env.DOCKING_PRICE_PER_MOLECULE_USD);
  return Number.isFinite(configured) && configured > 0 ? configured : 0.0005;
})();
const SERVICE_FEE_RATE = 0.10;
export const MAX_CHUNK_ATTEMPTS = 3;
const EXCLUSION_GRACE = "2 minutes";
const MAX_SCREEN_MOLECULES = 100_000;

export function countMolecules(text) {
  return String(text).split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith("#")).length;
}

// Integer cents throughout, like the ledger itself.
export function screenCost(molecules, rate = DOCKING_PRICE_PER_MOLECULE_USD) {
  const subtotalCents = Math.round(molecules * rate * 100);
  const feeCents = Math.round(subtotalCents * SERVICE_FEE_RATE);
  return { subtotalCents, feeCents, totalCents: subtotalCents + feeCents };
}

// Splits the pay for docked molecules across node owners so the parts sum
// exactly to the pool: each owner gets the floor of their share in cents,
// and the leftover cents go to the largest fractional remainders. Rounding
// each owner separately could pay out a cent or two more than was held.
export function splitPayouts(dockedByOwner, rate = DOCKING_PRICE_PER_MOLECULE_USD) {
  const owners = [...dockedByOwner.entries()].filter(([, molecules]) => molecules > 0);
  const totalMolecules = owners.reduce((sum, [, molecules]) => sum + molecules, 0);
  const poolCents = Math.round(totalMolecules * rate * 100);
  if (poolCents === 0) return { poolCents: 0, payouts: [] };
  const shares = owners.map(([ownerId, molecules]) => {
    const exact = (poolCents * molecules) / totalMolecules;
    return { ownerId, cents: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let leftover = poolCents - shares.reduce((sum, s) => sum + s.cents, 0);
  for (const share of [...shares].sort((a, b) => b.remainder - a.remainder)) {
    if (leftover === 0) break;
    share.cents += 1;
    leftover -= 1;
  }
  return { poolCents, payouts: shares.filter((s) => s.cents > 0).map(({ ownerId, cents }) => ({ ownerId, cents })) };
}

// A chunk's own runtime ceiling: generous per molecule (Vina takes ~5 s on
// four cores; huge flexible molecules take longer), so the reaper only
// steps in for a computer that has really stalled.
function chunkRuntimeHours(molecules) {
  return Math.min(4, Math.max(0.25, Math.ceil((molecules * 60) / 3600 * 100) / 100));
}

export async function createScreen(client, { userId, name, inputIds, workload }) {
  const uniqueInputIds = [...new Set(inputIds.map(String))];
  const { rows: inputs } = await client.query(
    `SELECT id::text, filename, content_type, sha256, byte_size, data FROM job_inputs
     WHERE id = ANY($1::uuid[]) AND user_id = $2 AND job_id IS NULL AND expires_at > now()
     ORDER BY filename, id FOR UPDATE`,
    [uniqueInputIds, userId]
  );
  if (inputs.length !== uniqueInputIds.length) {
    throw new JobMatchError(400, "One or more uploaded inputs are missing, expired, or already used");
  }
  const chunks = inputs.map((input) => ({ input, molecules: countMolecules(input.data.toString("utf8")) }));
  if (chunks.some((c) => c.molecules === 0)) throw new JobMatchError(400, "Every library file needs at least one molecule");
  const totalMolecules = chunks.reduce((sum, c) => sum + c.molecules, 0);
  if (totalMolecules > MAX_SCREEN_MOLECULES) {
    throw new JobMatchError(400, `A screen can hold at most ${MAX_SCREEN_MOLECULES.toLocaleString()} molecules`);
  }

  const cost = screenCost(totalMolecules);
  const balance = Number((await client.query(`SELECT balance_usdc FROM users WHERE id = $1 FOR UPDATE`, [userId])).rows[0].balance_usdc);
  if (balance * 100 < cost.totalCents) {
    throw new JobMatchError(402, `Insufficient balance — need $${(cost.totalCents / 100).toFixed(2)}, have $${balance.toFixed(2)}`);
  }

  const { rows: [screen] } = await client.query(
    `INSERT INTO jobs (
       user_id, node_id, name, price_per_hour, max_runtime_hours, subtotal_usd, fee_usd, total_usd,
       workload_id, docker_image, gpus_needed, min_vram_gb, env_vars, result_schema, price_per_unit_usd, status
     ) VALUES ($1, NULL, $2, 0, $3, $4, $5, $6, $7, $8, $9, $10, '{}', $11, $12, 'pending') RETURNING *`,
    [userId, name || "Docking screen", workload.maxRuntimeHours, (cost.subtotalCents / 100).toFixed(2),
      (cost.feeCents / 100).toFixed(2), (cost.totalCents / 100).toFixed(2), workload.id, workload.image,
      workload.gpusNeeded, workload.minVramGb, workload.resultSchema, DOCKING_PRICE_PER_MOLECULE_USD]
  );

  if (cost.totalCents > 0) {
    const userAccountId = await getUserAccountId(client, userId);
    const platformEscrowId = await getPlatformAccountId(client, "platform_escrow");
    const total = cost.totalCents / 100;
    const txnId = await postTransaction(client, {
      type: "job_escrow_hold", referenceType: "job", referenceId: screen.id,
      lines: [
        { accountId: userAccountId, amount: total },
        { accountId: platformEscrowId, amount: -total },
      ],
      userBalanceDelta: { userId, amount: -total },
    });
    await client.query(`UPDATE jobs SET escrow_transaction_id = $1 WHERE id = $2`, [txnId, screen.id]);
  }

  for (const { input, molecules } of chunks) {
    const chunkId = crypto.randomUUID();
    const seed = deterministicSeed(chunkId, 0);
    const envVars = { DECOMPUTE_SEED: String(seed) };
    await client.query(
      `INSERT INTO jobs (
         id, user_id, node_id, parent_job_id, name, price_per_hour, max_runtime_hours, subtotal_usd, fee_usd, total_usd,
         workload_id, docker_image, gpus_needed, min_vram_gb, env_vars, deterministic_seed, input_hash, result_schema,
         unit_count, settlement_state
       ) VALUES ($1, $2, NULL, $3, $4, 0, $5, 0, 0, 0, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'held')`,
      [chunkId, userId, screen.id, `${screen.name} · ${input.filename}`, chunkRuntimeHours(molecules),
        workload.id, workload.image, workload.gpusNeeded, workload.minVramGb, JSON.stringify(envVars), seed,
        hashInputs(envVars, [input]), workload.resultSchema, molecules]
    );
    // Uploads expire an hour after upload if unused, but a queued chunk can
    // wait far longer than that for a computer, so attached files live as
    // long as the queue needs them. They're still deleted the moment their
    // chunk finishes (finishChunk) or is cancelled (cancelScreen).
    await client.query(`UPDATE job_inputs SET job_id = $1, expires_at = now() + interval '7 days' WHERE id = $2`,
      [chunkId, input.id]);
  }

  return { screen, molecules: totalMolecules, chunks: chunks.length, cost };
}

// Hands the oldest queued chunk to a free node. FOR UPDATE SKIP LOCKED means
// two computers checking in at the same moment can never get the same
// chunk. A chunk goes to a computer that hasn't failed it yet when one is
// available; if nobody else takes it within EXCLUSION_GRACE, the computer
// that failed it may try again, so a screen on a small network can't stall
// waiting for a computer that doesn't exist. MAX_CHUNK_ATTEMPTS still caps
// how often any chunk is retried.
export async function claimNextChunk(nodeId) {
  if (incidentModeEnabled()) return null;
  const { rows } = await query(
    `UPDATE jobs SET node_id = $1, assigned_at = now()
     WHERE id = (
       SELECT c.id FROM jobs c
       WHERE c.status = 'pending' AND c.node_id IS NULL AND c.unit_count IS NOT NULL
         AND (NOT ($1 = ANY(c.excluded_node_ids)) OR c.requeued_at < now() - interval '${EXCLUSION_GRACE}')
         AND EXISTS (SELECT 1 FROM job_inputs i WHERE i.job_id = c.id)
       ORDER BY c.created_at, c.id
       FOR UPDATE SKIP LOCKED LIMIT 1
     )
     AND EXISTS (
       SELECT 1 FROM nodes n WHERE n.id = $1 AND n.active AND n.os IN ('windows','linux')
         AND COALESCE(n.gpu_count, 0) >= jobs.gpus_needed
         AND (jobs.gpus_needed = 0 OR lower(n.gpu_vendor) = 'nvidia')
     )
     RETURNING *`,
    [nodeId]
  );
  if (rows[0]) await query(`UPDATE nodes SET last_job_assigned_at = now() WHERE id = $1`, [nodeId]);
  return rows[0] || null;
}

// Records a chunk's outcome on a locked chunk row. A failure goes back into
// the queue for a different computer until MAX_CHUNK_ATTEMPTS is reached;
// only then is it final, and its molecules simply aren't billed.
export async function finishChunk(client, chunk, status, reason = null) {
  if (status === "done") {
    await client.query(
      `UPDATE jobs SET status = 'done', completed_at = now(), settlement_state = 'released',
         billed_subtotal_usd = 0, billed_fee_usd = 0, billed_total_usd = 0 WHERE id = $1`,
      [chunk.id]
    );
    await client.query(`DELETE FROM job_inputs WHERE job_id = $1`, [chunk.id]);
  } else if (Number(chunk.retry_count) + 1 < MAX_CHUNK_ATTEMPTS) {
    // The inputs stay attached for the next attempt; everything the last
    // node produced is cleared so the next one starts from scratch.
    await client.query(
      `UPDATE jobs SET status = 'pending', node_id = NULL, assigned_at = NULL, started_at = NULL,
         requeued_at = now(), retry_count = retry_count + 1, manifest_hash = NULL,
         result_validated = false, result_hash = NULL, result_metadata = '{}', failure_reason = $2,
         excluded_node_ids = CASE WHEN $3::text IS NULL THEN excluded_node_ids ELSE array_append(excluded_node_ids, $3::text) END
       WHERE id = $1`,
      [chunk.id, reason, chunk.node_id]
    );
  } else {
    await client.query(
      `UPDATE jobs SET status = 'failed', completed_at = now(), settlement_state = 'refunded', failure_reason = $2,
         billed_subtotal_usd = 0, billed_fee_usd = 0, billed_total_usd = 0 WHERE id = $1`,
      [chunk.id, reason]
    );
    await client.query(`DELETE FROM job_inputs WHERE job_id = $1`, [chunk.id]);
  }
  if (chunk.node_id) await refreshNodeReliability(client, chunk.node_id);
  await settleScreenIfComplete(client, chunk.parent_job_id);
}

// Pays out a screen once none of its chunks is still queued or running.
// Safe to call any time: it does nothing until the screen is complete, and
// nothing twice (settlement_state leaves 'held' exactly once).
export async function settleScreenIfComplete(client, screenId) {
  if (!screenId || incidentModeEnabled()) return false;
  const { rows: [screen] } = await client.query(
    `SELECT * FROM jobs WHERE id = $1 AND price_per_unit_usd IS NOT NULL AND settlement_state = 'held' FOR UPDATE`,
    [screenId]
  );
  if (!screen) return false;
  const { rows: [open] } = await client.query(
    `SELECT count(*)::int AS n FROM jobs WHERE parent_job_id = $1 AND status IN ('pending','running')`, [screenId]
  );
  if (open.n > 0) return false;

  const { rows: docked } = await client.query(
    `SELECT n.owner_id, sum(COALESCE((c.result_metadata->>'dockedCount')::int, 0))::int AS molecules
     FROM jobs c JOIN nodes n ON n.id = c.node_id
     WHERE c.parent_job_id = $1 AND c.status = 'done'
     GROUP BY n.owner_id`,
    [screenId]
  );
  const rate = Number(screen.price_per_unit_usd);
  const { poolCents, payouts } = splitPayouts(new Map(docked.map((r) => [r.owner_id, r.molecules])), rate);
  const heldCents = Math.round(Number(screen.total_usd) * 100);
  const feeCents = Math.min(Math.round(poolCents * SERVICE_FEE_RATE), heldCents - poolCents);
  const refundCents = heldCents - poolCents - feeCents;

  const platformEscrowId = await getPlatformAccountId(client, "platform_escrow");
  let settlementTxnId = null;
  for (const { ownerId, cents } of payouts) {
    const amount = cents / 100;
    settlementTxnId = await postTransaction(client, {
      type: "job_escrow_release", referenceType: "job", referenceId: screen.id,
      metadata: { kind: "docking_payout" },
      lines: [
        { accountId: platformEscrowId, amount },
        { accountId: await getUserAccountId(client, ownerId), amount: -amount },
      ],
      userBalanceDelta: { userId: ownerId, amount },
    });
  }
  if (feeCents > 0) {
    const amount = feeCents / 100;
    await postTransaction(client, {
      type: "job_escrow_release", referenceType: "job", referenceId: screen.id,
      metadata: { kind: "docking_fee" },
      lines: [
        { accountId: platformEscrowId, amount },
        { accountId: await getPlatformAccountId(client, "platform_revenue"), amount: -amount },
      ],
    });
  }
  if (refundCents > 0) {
    const amount = refundCents / 100;
    const refundTxnId = await postTransaction(client, {
      type: "job_refund", referenceType: "job", referenceId: screen.id,
      lines: [
        { accountId: platformEscrowId, amount },
        { accountId: await getUserAccountId(client, screen.user_id), amount: -amount },
      ],
      userBalanceDelta: { userId: screen.user_id, amount },
    });
    settlementTxnId ??= refundTxnId;
  }

  const anyDocked = poolCents > 0 || docked.some((r) => r.molecules > 0);
  await client.query(
    `UPDATE jobs SET status = $2, completed_at = now(), settlement_transaction_id = $3,
       billed_subtotal_usd = $4, billed_fee_usd = $5, billed_total_usd = $6, settlement_state = $7
     WHERE id = $1`,
    [screen.id, anyDocked ? "done" : "failed", settlementTxnId, (poolCents / 100).toFixed(2),
      (feeCents / 100).toFixed(2), ((poolCents + feeCents) / 100).toFixed(2), anyDocked ? "released" : "refunded"]
  );
  return true;
}

// Stops a screen: queued chunks are cancelled, running ones finish (and get
// paid), and the screen settles as soon as nothing is left running.
export async function cancelScreen(client, screenId) {
  const { rows } = await client.query(
    `UPDATE jobs SET status = 'cancelled', completed_at = now(), settlement_state = 'refunded'
     WHERE parent_job_id = $1 AND status = 'pending' RETURNING id`,
    [screenId]
  );
  if (rows.length) await client.query(`DELETE FROM job_inputs WHERE job_id = ANY($1::uuid[])`, [rows.map((r) => r.id)]);
  await settleScreenIfComplete(client, screenId);
  return rows.length;
}
