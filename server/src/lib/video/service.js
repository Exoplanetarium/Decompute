import crypto from "node:crypto";
import { PRESETS, SHOT_PRESET, FAST_SHOT_PRESET, SHOT_PRESETS, REFERENCE_PRESET, MAX_ATTEMPTS, QUALIFICATION_PROJECTS, QUALIFICATION_WINDOW, VideoError,
  hash, requestSpec, buildQuote, workerCost, qualificationCost, compileTasks, canReserve, canEverReserve, actualCost, seedFor,
  signManifest, usd, qualificationStats, canaryPlan } from "./policy.js";
import { planBudgetMicros, reviewBudgetMicros } from "./models.js";
import { transferMicros } from "./ledger.js";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function requireId(id) { if (!UUID.test(String(id))) throw new VideoError(400, "Invalid video identifier."); return id; }

export function runtimeConfig(env = process.env) {
  const entry = (prefix) => ({ image: env[`${prefix}_IMAGE`], revision: env[`${prefix}_REVISION`] });
  return { [SHOT_PRESET]: entry("VIDEO_SHOT"), [FAST_SHOT_PRESET]: entry("VIDEO_FAST_SHOT"), [REFERENCE_PRESET]: entry("VIDEO_REFERENCE") };
}

export class VideoService {
  constructor({ pool, storage, media, models, config = () => runtimeConfig(), paused = () => false, enabled = () => process.env.VIDEO_ENABLED === "true" }) {
    Object.assign(this, { pool, storage, media, models, config, paused, enabled });
  }
  async tx(fn) {
    const client = await this.pool.connect();
    try { await client.query("BEGIN"); const result = await fn(client); await client.query("COMMIT"); return result; }
    catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  pinned(presetId) {
    const entry = this.config()[presetId];
    return /@sha256:[a-f0-9]{64}$/.test(entry?.image || "") && /^[a-f0-9]{40}$/.test(entry?.revision || "") ? entry : null;
  }
  configured() {
    return this.enabled() && this.models.ready && !!this.pinned(REFERENCE_PRESET) && SHOT_PRESETS.some((id) => this.pinned(id));
  }
  async assertReady() {
    if (this.paused()) throw new VideoError(503, "Video generation is temporarily paused.");
    if (!this.configured() || !(await this.media.ready())) throw new VideoError(503, "Video generation is being prepared. No funds have been reserved.");
  }
  // Presets this node's hardware can run and the operator has pinned.
  presetsFor(node) {
    return Object.keys(PRESETS).filter((id) => this.pinned(id) && String(node.gpu_vendor).toLowerCase() === "nvidia"
      && ["windows", "linux"].includes(node.os) && Number(node.vram_gb) >= PRESETS[id].minVramGb && Number(node.ram_gb) >= PRESETS[id].minRamGb);
  }
  async candidates(client = this.pool) {
    const config = this.config();
    const result = await client.query(`SELECT n.*, q.preset_id, q.image_digest, q.model_revision,
      q.p50_seconds, q.p95_seconds, q.acceptance, q.samples
      FROM nodes n JOIN video_qualifications q ON q.node_id = n.id
      WHERE n.active AND n.owner_id IS NOT NULL AND lower(n.gpu_vendor) = 'nvidia'
        AND n.os IN ('windows','linux') AND n.last_seen_at > now() - interval '90 seconds'
        AND q.expires_at > now()`);
    return result.rows.filter((row) => {
      const preset = PRESETS[row.preset_id], pinned = config[row.preset_id];
      return preset && pinned && row.image_digest === pinned.image && row.model_revision === pinned.revision
        && Number(row.vram_gb) >= preset.minVramGb && Number(row.ram_gb) >= preset.minRamGb
        && Number(row.samples) >= 20;
    });
  }
  // A qualification project may only run on its own node, which by
  // definition has no measured record yet for the preset being qualified.
  async pinnedCandidates(client, project) {
    const node = (await client.query(`SELECT * FROM nodes WHERE id=$1 AND active AND owner_id IS NOT NULL
      AND last_seen_at > now() - interval '90 seconds'`, [project.pinned_node_id])).rows[0];
    if (!node) return [];
    return project.quote.presets.filter((id) => this.presetsFor(node).includes(id)).map((preset_id) => ({ ...node, preset_id }));
  }
  async quote(durationSeconds) {
    await this.assertReady();
    return buildQuote(Number(durationSeconds), await this.candidates());
  }
  async create(userId, input, requestKey) {
    const request = requestSpec(input);
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(requestKey || "")) throw new VideoError(400, "A unique Idempotency-Key is required.");
    const requestHash = hash(request);
    const existing = (await this.pool.query(`SELECT * FROM video_projects WHERE user_id=$1 AND request_key=$2`, [userId, requestKey])).rows[0];
    if (existing) {
      if (existing.request_hash !== requestHash) throw new VideoError(409, "This request key was already used for a different video.");
      return this.get(userId, existing.id);
    }
    const quote = await this.quote(request.durationSeconds);
    const id = await this.tx(async (client) => {
      const user = (await client.query(`SELECT balance_usdc FROM users WHERE id=$1 FOR UPDATE`, [userId])).rows[0];
      const duplicate = (await client.query(`SELECT id, request_hash FROM video_projects WHERE user_id=$1 AND request_key=$2`, [userId, requestKey])).rows[0];
      if (duplicate) {
        if (duplicate.request_hash !== requestHash) throw new VideoError(409, "This request key was already used for a different video.");
        return duplicate.id;
      }
      if (!user || Number(user.balance_usdc) < usd(quote.priceMicros)) throw new VideoError(402, "Add credit before creating this video.");
      const project = (await client.query(`INSERT INTO video_projects
        (user_id,request_key,request_hash,prompt,duration_seconds,style,quote,price_micros,compute_cap_micros)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [userId, requestKey, requestHash, request.prompt, request.durationSeconds, request.style, JSON.stringify(quote), quote.priceMicros, quote.computeCapMicros])).rows[0];
      await transferMicros(client, { from: { userId }, to: { platform: "platform_escrow" }, micros: quote.priceMicros,
        type: "job_escrow_hold", referenceId: project.id, key: `video-hold:${project.id}` });
      return project.id;
    });
    return this.get(userId, id);
  }
  async get(userId, id) {
    requireId(id);
    const row = (await this.pool.query(`SELECT * FROM video_projects WHERE id=$1 AND user_id=$2 AND kind='retail'`, [id, userId])).rows[0];
    if (!row) throw new VideoError(404, "Video not found.");
    const tasks = (await this.pool.query(`SELECT task_key,kind,shot_index,status,attempt_count,failure_reason FROM video_tasks WHERE project_id=$1 ORDER BY shot_index NULLS FIRST,kind`, [id])).rows;
    return { id: row.id, title: row.plan?.title || row.prompt.slice(0, 80), prompt: row.prompt,
      durationSeconds: row.duration_seconds, style: row.style, status: row.status, priceUsd: usd(row.price_micros),
      refunded: !!row.settled_at && row.status !== "done", createdAt: row.created_at, completedAt: row.completed_at,
      failureReason: row.failure_reason, plan: row.plan, tasks,
      progress: tasks.length ? tasks.filter((t) => t.status === "done").length / tasks.length : 0,
      hasArtifact: row.status === "done" && !!row.final_asset_id, expiresAt: row.expires_at };
  }
  async list(userId) {
    const rows = (await this.pool.query(`SELECT id FROM video_projects WHERE user_id=$1 AND kind='retail' ORDER BY created_at DESC LIMIT 30`, [userId])).rows;
    return Promise.all(rows.map((row) => this.get(userId, row.id)));
  }
  async settleProject(client, project, status, reason = null, finalAssetId = null) {
    if (project.settled_at) return;
    const terminal = status === "done";
    await transferMicros(client, { from: { platform: "platform_escrow" },
      to: terminal ? { platform: "platform_revenue" } : { userId: project.user_id },
      micros: Number(project.price_micros), type: terminal ? "job_escrow_release" : "job_refund",
      referenceId: project.id, key: `video-settle:${project.id}` });
    // Stop unfinished attempts atomically. Late uploads/completions are fenced
    // by their unique attempt id and the now-terminal project status.
    await client.query(`UPDATE video_attempts SET status='cancelled',completed_at=now() WHERE project_id=$1 AND status IN ('pending','running','review')`, [project.id]);
    await client.query(`UPDATE video_tasks SET status='cancelled' WHERE project_id=$1 AND status NOT IN ('done','failed')`, [project.id]);
    await client.query(`UPDATE video_projects SET status=$2,failure_reason=$3,final_asset_id=$4,
      completed_at=now(),settled_at=now(),reserved_micros=0,lease_token=NULL,lease_expires_at=NULL WHERE id=$1`, [project.id, status, reason, finalAssetId]);
  }
  async cancel(userId, id) {
    requireId(id);
    if (this.paused()) throw new VideoError(503, "Video settlement is temporarily paused.");
    await this.tx(async (client) => {
      const project = (await client.query(`SELECT * FROM video_projects WHERE id=$1 AND user_id=$2 AND kind='retail' FOR UPDATE`, [id, userId])).rows[0];
      if (!project) throw new VideoError(404, "Video not found.");
      await this.settleProject(client, project, "cancelled", "Cancelled by you; the video price was refunded.");
    });
    return this.get(userId, id);
  }
  async fail(projectId, reason) {
    if (this.paused()) return;
    await this.tx(async (client) => {
      const project = (await client.query(`SELECT * FROM video_projects WHERE id=$1 FOR UPDATE`, [projectId])).rows[0];
      if (project) await this.settleProject(client, project, "failed", reason.slice(0, 400));
    });
  }
  async reserveApi(projectId, amount) {
    const result = await this.pool.query(`UPDATE video_projects SET model_api_micros=model_api_micros+$2
      WHERE id=$1 AND settled_at IS NULL AND model_api_micros+$2 <= (quote->>'overheadMicros')::bigint-10000 RETURNING id`, [projectId, amount]);
    if (!result.rows.length) throw new VideoError(422, "The planning and quality-check budget was reached.");
  }
  async recordApi(projectId, reserved, actual) {
    const cost = Number.isSafeInteger(actual) && actual >= 0 ? actual : reserved;
    if (cost > reserved) console.warn("Video model call cost more than its reservation", projectId, cost, reserved);
    await this.pool.query(`UPDATE video_projects SET model_api_micros=model_api_micros-$2+$3 WHERE id=$1`, [projectId, reserved, cost]);
  }
  // Reserve a model call's worst case against the project's allowance, then
  // record what it actually cost. Transient provider failures bill nothing.
  async metered(projectId, maxMicros, call) {
    await this.reserveApi(projectId, maxMicros);
    let actual = maxMicros;
    try { const result = await call(); actual = result.costMicros; return result; }
    catch (error) { actual = error.retryable ? error.costMicros || 0 : error.costMicros ?? maxMicros; throw error; }
    finally { await this.recordApi(projectId, maxMicros, actual); }
  }
  async planProject(project, lease) {
    await this.pool.query(`UPDATE video_projects SET status='planning' WHERE id=$1 AND lease_token=$2 AND status='queued'`, [project.id, lease]);
    const result = await this.metered(project.id, planBudgetMicros(project.duration_seconds / 5),
      () => this.models.plan({ prompt: project.prompt, durationSeconds: project.duration_seconds, style: project.style }));
    await this.tx(async (client) => {
      const current = (await client.query(`SELECT * FROM video_projects WHERE id=$1 AND lease_token=$2 AND settled_at IS NULL FOR UPDATE`, [project.id, lease])).rows[0];
      if (!current) return;
      for (const task of compileTasks(project.id, result.plan, { shotPreset: project.quote.presetId })) await client.query(`INSERT INTO video_tasks
        (project_id,task_key,kind,shot_index,spec,dependencies) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (project_id,task_key) DO NOTHING`,
        [project.id, task.key, task.kind, task.shotIndex ?? null, JSON.stringify(task.spec), task.dependencies]);
      await client.query(`UPDATE video_projects SET plan=$2,status='rendering' WHERE id=$1`, [project.id, JSON.stringify(result.plan)]);
    });
  }
  async dispatch(projectId) {
    await this.tx(async (client) => {
      const project = (await client.query(`SELECT * FROM video_projects WHERE id=$1 AND status='rendering' AND settled_at IS NULL FOR UPDATE`, [projectId])).rows[0];
      if (!project) return;
      const qualification = project.kind === "qualification";
      const tasks = (await client.query(`SELECT * FROM video_tasks WHERE project_id=$1 ORDER BY shot_index NULLS FIRST, task_key`, [projectId])).rows;
      const candidates = qualification ? await this.pinnedCandidates(client, project) : await this.candidates(client);
      for (const task of tasks.filter((t) => t.status === "queued")) {
        const dependencies = task.dependencies.map((key) => tasks.find((t) => t.task_key === key));
        if (dependencies.some((dep) => !dep || dep.status !== "done")) continue;
        if (task.attempt_count >= MAX_ATTEMPTS) throw new VideoError(422, "A shot could not pass quality checks within the retry limit.");
        const presetId = task.kind === "shot" ? project.quote.presetId : REFERENCE_PRESET;
        const eligible = candidates.filter((candidate) => candidate.preset_id === presetId)
          .map((worker) => ({ worker, cost: qualification ? qualificationCost(presetId) : workerCost(worker) })).filter((c) => c.cost)
          .sort((a, b) => a.cost.expectedMicros - b.cost.expectedMicros);
        if (eligible.length && !eligible.some((c) => canEverReserve(project, tasks, task, c.cost.reserveMicros))) {
          throw new VideoError(422, "Retries used up this video's fixed compute budget.");
        }
        let chosen;
        for (const candidate of eligible) {
          if (!canReserve(project, tasks, task, candidate.cost.reserveMicros)) continue;
          const node = (await client.query(`SELECT id FROM nodes n WHERE id=$1
            AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.node_id=n.id AND j.status IN ('pending','running'))
            AND NOT EXISTS (SELECT 1 FROM video_attempts a WHERE a.node_id=n.id AND a.status IN ('pending','running'))
            FOR UPDATE OF n SKIP LOCKED`, [candidate.worker.id])).rows[0];
          if (node) { chosen = candidate; break; }
        }
        if (!chosen) continue; // durable queue; no required task is dropped
        const { worker, cost } = chosen;
        const id = crypto.randomUUID(), preset = PRESETS[presetId], config = this.config()[presetId];
        const inputs = [];
        for (const dep of dependencies) {
          const asset = (await client.query(`SELECT * FROM video_assets WHERE id=$1 AND project_id=$2`, [dep.output_asset_id, projectId])).rows[0];
          if (!asset) throw new Error("Missing approved reference asset");
          inputs.push({ id: asset.id, filename: "reference.png", contentType: asset.content_type, byteSize: Number(asset.byte_size), sha256: asset.sha256 });
        }
        const compiled = { ...task.spec, kind: task.kind, presetId, modelRevision: config.revision,
          seed: seedFor(projectId, task.task_key, task.creative_revision) };
        const manifestSpec = { presetId, workloadId: preset.workloadId, image: config.image, modelId: preset.modelId,
          modelRevision: config.revision, inputs, compiled, inputHash: hash({ compiled, inputs }), maxBytes: preset.maxBytes };
        await client.query(`INSERT INTO video_attempts
          (id,task_id,project_id,node_id,owner_id,attempt_number,manifest_spec,hourly_micros,reserved_micros,max_seconds,deadline_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now()+interval '3 minutes')`,
          [id, task.id, projectId, worker.id, worker.owner_id, task.attempt_count + 1, JSON.stringify(manifestSpec), cost.hourlyMicros, cost.reserveMicros, cost.maxSeconds]);
        await client.query(`UPDATE video_tasks SET status='assigned',attempt_count=attempt_count+1,active_attempt_id=$2 WHERE id=$1`, [task.id, id]);
        await client.query(`UPDATE video_projects SET reserved_micros=reserved_micros+$2 WHERE id=$1`, [projectId, cost.reserveMicros]);
        project.reserved_micros = Number(project.reserved_micros) + cost.reserveMicros;
        task.status = "assigned";
      }
    });
  }
  async assignment(nodeId, token) {
    if (!this.enabled() || this.paused()) return null;
    const attempt = (await this.pool.query(`SELECT a.* FROM video_attempts a JOIN video_projects p ON p.id=a.project_id
      WHERE a.node_id=$1 AND a.status IN ('pending','running') AND p.settled_at IS NULL ORDER BY a.created_at LIMIT 1`, [nodeId])).rows[0];
    if (!attempt) return null;
    const spec = attempt.manifest_spec, preset = PRESETS[spec.presetId];
    return signManifest({ version: 2, kind: "video", jobId: attempt.id, nodeId, attempt: attempt.attempt_number,
      issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), seed: spec.compiled.seed, inputHash: spec.inputHash,
      execution: { workloadId: spec.workloadId, dockerImage: spec.image, modelId: spec.modelId,
        cacheKey: `${spec.modelId}@${spec.modelRevision}`, gpusNeeded: 1, maxRuntimeHours: attempt.max_seconds / 3600,
        envVars: { DECOMPUTE_VIDEO_SPEC: JSON.stringify(spec.compiled), DECOMPUTE_SEED: String(spec.compiled.seed) } },
      inputs: spec.inputs, result: { schema: preset.schema, required: true, maxBytes: preset.maxBytes, allowedContentTypes: [preset.contentType] } }, token);
  }
  async claim(nodeId, id) {
    requireId(id);
    if (this.paused()) throw new VideoError(503, "Video generation is paused.");
    const result = await this.pool.query(`UPDATE video_attempts a SET status='running',started_at=now(),
      deadline_at=now()+make_interval(secs=>max_seconds)+interval '2 minutes'
      WHERE id=$1 AND node_id=$2 AND status='pending' AND deadline_at>now()
      AND EXISTS (SELECT 1 FROM video_projects p WHERE p.id=a.project_id AND p.settled_at IS NULL) RETURNING id`, [id, nodeId]);
    if (!result.rows.length) throw new VideoError(409, "Video attempt is no longer claimable.");
  }
  async attempt(nodeId, id) {
    requireId(id);
    const row = (await this.pool.query(`SELECT a.* FROM video_attempts a JOIN video_projects p ON p.id=a.project_id
      JOIN video_tasks t ON t.id=a.task_id WHERE a.id=$1 AND a.node_id=$2 AND a.status IN ('pending','running')
      AND a.deadline_at>now() AND p.settled_at IS NULL AND t.active_attempt_id=a.id`, [id, nodeId])).rows[0];
    if (!row) throw new VideoError(409, "Video attempt is no longer active.");
    return row;
  }
  async input(nodeId, id, assetId) {
    const attempt = await this.attempt(nodeId, id);
    if (!attempt.manifest_spec.inputs.some((input) => input.id === assetId)) throw new VideoError(404, "Input not found.");
    const asset = (await this.pool.query(`SELECT * FROM video_assets WHERE id=$1 AND project_id=$2`, [requireId(assetId), attempt.project_id])).rows[0];
    if (!asset) throw new VideoError(404, "Input expired.");
    return asset;
  }
  async upload(nodeId, id, contentType, data, claimedHash) {
    const attempt = await this.attempt(nodeId, id);
    if (attempt.status !== "running") throw new VideoError(409, "Claim the attempt before uploading.");
    const preset = PRESETS[attempt.manifest_spec.presetId];
    if (!Buffer.isBuffer(data) || !data.length || data.length > preset.maxBytes || contentType !== preset.contentType || claimedHash !== hash(data)) throw new VideoError(422, "Video result type, size, or checksum is invalid.");
    const previous = (await this.pool.query(`SELECT * FROM video_assets WHERE attempt_id=$1`, [id])).rows[0];
    if (previous) {
      if (previous.sha256 !== claimedHash) throw new VideoError(409, "This attempt already uploaded a different result.");
      return previous;
    }
    const asset = await this.storage.put(attempt.project_id, contentType, data);
    try {
      let inspected;
      try { inspected = await this.media.inspect(this.storage.path(asset.storageKey), preset.contentType === "video/mp4" ? "shot" : "reference"); }
      catch (error) { throw new VideoError(422, `Video result failed validation: ${String(error.message).split("\n")[0].slice(0, 200)}`); }
      return await this.tx(async (client) => {
        const project = (await client.query(`SELECT * FROM video_projects WHERE id=$1 FOR UPDATE`, [attempt.project_id])).rows[0];
        const current = (await client.query(`SELECT * FROM video_attempts WHERE id=$1 FOR UPDATE`, [id])).rows[0];
        if (project.settled_at || current.status !== "running" || new Date(current.deadline_at) < new Date()) throw new VideoError(409, "Video attempt expired while uploading.");
        const duplicate = (await client.query(`SELECT * FROM video_assets WHERE attempt_id=$1`, [id])).rows[0];
        if (duplicate) throw new VideoError(409, "Video result already uploaded; retry completion.");
        const row = (await client.query(`INSERT INTO video_assets (id,project_id,attempt_id,storage_key,content_type,sha256,byte_size,metadata)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [asset.id, attempt.project_id, id, asset.storageKey, contentType, claimedHash, data.length, JSON.stringify(inspected.metadata)])).rows[0];
        await client.query(`UPDATE video_attempts SET asset_id=$2,result_metadata=$3 WHERE id=$1`, [id, asset.id, JSON.stringify(inspected.metadata)]);
        return row;
      });
    } catch (error) { await this.storage.remove(asset.storageKey); throw error; }
  }
  async finishAttempt(nodeId, id, status, reason = null) {
    requireId(id);
    if (!["done", "failed"].includes(status)) throw new VideoError(400, "Invalid completion status.");
    const row = (await this.pool.query(`SELECT project_id FROM video_attempts WHERE id=$1 AND node_id=$2`, [id, nodeId])).rows[0];
    if (!row) throw new VideoError(404, "Video attempt not found.");
    await this.tx(async (client) => {
      const project = (await client.query(`SELECT * FROM video_projects WHERE id=$1 FOR UPDATE`, [row.project_id])).rows[0];
      const attempt = (await client.query(`SELECT * FROM video_attempts WHERE id=$1 FOR UPDATE`, [id])).rows[0];
      if (["review", "done", "failed"].includes(attempt.status)) return; // acknowledged retry of completion
      if (project.settled_at || attempt.status !== "running" || new Date(attempt.deadline_at) < new Date()) throw new VideoError(409, "Video attempt is no longer active.");
      if (status === "done" && !attempt.asset_id) throw new VideoError(422, "Upload a valid artifact before completing the attempt.");
      // Incident mode records no money movement. Completion remains retryable.
      if (this.paused()) throw new VideoError(503, "Video settlement is temporarily paused; retry completion.");
      await this.endAttempt(client, project, attempt, status, reason);
    });
  }
  async endAttempt(client, project, attempt, status, reason) {
    const paid = status === "done" ? actualCost(attempt) : 0;
    if (paid) await transferMicros(client, { from: { platform: "platform_revenue" }, to: { userId: attempt.owner_id },
      micros: paid, type: "job_escrow_release", referenceId: project.id, key: `video-attempt:${attempt.id}` });
    await client.query(`UPDATE video_projects SET reserved_micros=reserved_micros-$2,spent_micros=spent_micros+$3 WHERE id=$1`, [project.id, attempt.reserved_micros, paid]);
    await client.query(`UPDATE video_attempts SET status=$2,completed_at=now(),paid_micros=$3,settled_at=now(),failure_reason=$4 WHERE id=$1`,
      [attempt.id, status === "done" ? "review" : "failed", paid, reason?.slice(0, 400) || null]);
    await client.query(`UPDATE video_tasks SET status=$2,failure_reason=$3 WHERE id=$1 AND active_attempt_id=$4`,
      [attempt.task_id, status === "done" ? "review" : "queued", reason?.slice(0, 400) || null, attempt.id]);
    if (status !== "done") await this.refreshQualification(client, attempt.node_id, attempt.manifest_spec.presetId);
  }
  async reap(projectId) {
    await this.tx(async (client) => {
      const project = (await client.query(`SELECT * FROM video_projects WHERE id=$1 AND settled_at IS NULL FOR UPDATE`, [projectId])).rows[0];
      if (!project) return;
      const attempts = (await client.query(`SELECT a.* FROM video_attempts a JOIN nodes n ON n.id=a.node_id
        WHERE a.project_id=$1 AND a.status IN ('pending','running') AND
        (a.deadline_at<now() OR n.last_seen_at<now()-interval '2 minutes') FOR UPDATE OF a`, [projectId])).rows;
      for (const attempt of attempts) await this.endAttempt(client, project, attempt, "failed", "Provider disconnected or exceeded the attempt deadline.");
    });
  }
  async reviewProject(projectId, lease) {
    const pending = (await this.pool.query(`SELECT t.*,a.asset_id,a.id AS attempt_id,a.node_id,a.manifest_spec->>'presetId' AS preset_id
      FROM video_tasks t JOIN video_attempts a ON a.id=t.active_attempt_id WHERE t.project_id=$1 AND t.status='review' ORDER BY t.task_key`, [projectId])).rows;
    for (const task of pending) {
      const asset = (await this.pool.query(`SELECT * FROM video_assets WHERE id=$1`, [task.asset_id])).rows[0];
      const inspected = await this.media.inspect(this.storage.path(asset.storage_key), task.kind);
      let reference = null;
      if (task.dependencies.length) {
        const ref = (await this.pool.query(`SELECT a.storage_key FROM video_tasks t JOIN video_assets a ON a.id=t.output_asset_id
          WHERE t.project_id=$1 AND t.task_key=$2`, [projectId, task.dependencies[0]])).rows[0];
        // Downscaled like the result frames: identity checks do not need
        // full resolution, and image tokens are part of the review budget.
        if (ref) reference = (await this.media.inspect(this.storage.path(ref.storage_key), "reference")).frames[0];
      }
      const review = await this.metered(projectId, reviewBudgetMicros(inspected.frames.length + (reference ? 1 : 0)),
        () => this.models.review({ spec: task.spec, reference, frames: inspected.frames, kind: task.kind }));
      await this.tx(async (client) => {
        const project = (await client.query(`SELECT * FROM video_projects WHERE id=$1 AND lease_token=$2 AND settled_at IS NULL FOR UPDATE`, [projectId, lease])).rows[0];
        if (!project) return;
        await client.query(`UPDATE video_tasks SET status=$2,output_asset_id=$3,failure_reason=$4,
          creative_revision=creative_revision+$5 WHERE id=$1 AND active_attempt_id=$6 AND status='review'`,
          [task.id, review.accepted ? "done" : "queued", review.accepted ? asset.id : null,
            review.accepted ? null : review.reason, review.accepted ? 0 : 1, task.attempt_id]);
        await client.query(`UPDATE video_attempts SET status='done',result_metadata=result_metadata || $2::jsonb WHERE id=$1`,
          [task.attempt_id, JSON.stringify({ quality: review })]);
        await this.refreshQualification(client, task.node_id, task.preset_id);
      });
    }
  }
  // Rebuilds a node's measured record for one preset from its most recent
  // finished attempts on the currently pinned image and model revision. The
  // canary run creates the record; production attempts keep it honest, and a
  // node whose acceptance falls below the admission bar drops out of quotes.
  async refreshQualification(client, nodeId, presetId) {
    const pinned = this.pinned(presetId);
    if (!pinned) return;
    const attempts = (await client.query(`SELECT id,status,started_at,completed_at,(result_metadata->'quality'->>'accepted')::boolean AS accepted
      FROM video_attempts WHERE node_id=$1 AND manifest_spec->>'presetId'=$2 AND manifest_spec->>'image'=$3
      AND manifest_spec->>'modelRevision'=$4 AND status IN ('done','failed') ORDER BY completed_at DESC LIMIT $5`,
      [nodeId, presetId, pinned.image, pinned.revision, QUALIFICATION_WINDOW])).rows;
    const stats = qualificationStats(attempts);
    if (!stats) return;
    await client.query(`INSERT INTO video_qualifications
      (node_id,preset_id,image_digest,model_revision,p50_seconds,p95_seconds,acceptance,samples,report_hash)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (node_id,preset_id) DO UPDATE SET
      image_digest=EXCLUDED.image_digest, model_revision=EXCLUDED.model_revision, p50_seconds=EXCLUDED.p50_seconds,
      p95_seconds=EXCLUDED.p95_seconds, acceptance=EXCLUDED.acceptance, samples=EXCLUDED.samples,
      report_hash=EXCLUDED.report_hash, approved_at=now(), expires_at=now()+interval '14 days'`,
      [nodeId, presetId, pinned.image, pinned.revision, stats.p50, stats.p95, stats.acceptance, stats.samples, hash(stats)]);
  }
  async assembleProject(project, lease) {
    const tasks = (await this.pool.query(`SELECT t.*,a.storage_key FROM video_tasks t LEFT JOIN video_assets a ON a.id=t.output_asset_id
      WHERE t.project_id=$1 ORDER BY t.shot_index`, [project.id])).rows;
    if (!tasks.length || tasks.some((task) => task.status !== "done")) return;
    if (project.kind === "qualification") {
      // Canary output only feeds the node's record; nothing is delivered.
      await this.tx(async (client) => {
        const current = (await client.query(`SELECT * FROM video_projects WHERE id=$1 AND lease_token=$2 AND settled_at IS NULL FOR UPDATE`, [project.id, lease])).rows[0];
        if (current && !this.paused()) await this.settleProject(client, current, "done");
      });
      return;
    }
    const shots = tasks.filter((task) => task.kind === "shot");
    if (shots.length !== project.duration_seconds / 5) throw new Error("Required timeline shots are missing");
    await this.pool.query(`UPDATE video_projects SET status='assembling' WHERE id=$1 AND lease_token=$2 AND settled_at IS NULL`, [project.id, lease]);
    const data = await this.media.assemble(shots.map((shot) => this.storage.path(shot.storage_key)));
    const asset = await this.storage.put(project.id, "video/mp4", data);
    let committed = false;
    try {
      await this.tx(async (client) => {
        const current = (await client.query(`SELECT * FROM video_projects WHERE id=$1 AND lease_token=$2 AND settled_at IS NULL FOR UPDATE`, [project.id, lease])).rows[0];
        if (!current || this.paused()) return;
        await client.query(`INSERT INTO video_assets (id,project_id,storage_key,content_type,sha256,byte_size)
          VALUES ($1,$2,$3,'video/mp4',$4,$5)`, [asset.id, project.id, asset.storageKey, asset.sha256, asset.byteSize]);
        await this.settleProject(client, current, "done", null, asset.id);
        committed = true;
      });
    } finally { if (!committed) await this.storage.remove(asset.storageKey); }
  }
  async tick() {
    if (!this.enabled() || this.paused()) return;
    // Least recently processed first, so every active project keeps moving.
    const projects = (await this.pool.query(`SELECT id FROM video_projects WHERE settled_at IS NULL
      AND (lease_expires_at IS NULL OR lease_expires_at<now()) ORDER BY ticked_at NULLS FIRST, created_at LIMIT 50`)).rows;
    for (const { id } of projects) {
      const lease = crypto.randomUUID();
      const project = (await this.pool.query(`UPDATE video_projects SET lease_token=$2,lease_expires_at=now()+interval '5 minutes',ticked_at=now()
        WHERE id=$1 AND settled_at IS NULL AND (lease_expires_at IS NULL OR lease_expires_at<now()) RETURNING *`, [id, lease])).rows[0];
      if (!project) continue;
      const qualification = project.kind === "qualification";
      try {
        if (new Date(project.expires_at) < new Date()) {
          await this.fail(id, qualification ? "The qualification run did not finish in time."
            : "Affordable capacity did not finish the video in time; your credit was refunded.");
          continue;
        }
        if (!project.plan) await this.planProject(project, lease);
        await this.reap(id);
        await this.reviewProject(id, lease);
        await this.dispatch(id);
        await this.assembleProject(project, lease);
      } catch (error) {
        if (error.retryable) console.warn("Video project waiting out a transient failure", id, error.message);
        else {
          console.error("Video project processing failed", id, error.message);
          await this.fail(id, error instanceof VideoError ? error.message
            : qualification ? "The qualification run could not finish." : "Video processing could not finish; your credit was refunded.");
        }
      } finally {
        await this.pool.query(`UPDATE video_projects SET lease_token=NULL,lease_expires_at=NULL WHERE id=$1 AND lease_token=$2`, [id, lease]);
      }
    }
  }
  async artifact(userId, projectId) {
    requireId(projectId);
    const asset = (await this.pool.query(`SELECT a.* FROM video_projects p JOIN video_assets a ON a.id=p.final_asset_id
      WHERE p.id=$1 AND p.user_id=$2 AND p.kind='retail' AND p.status='done' AND a.expires_at>now()`, [projectId, userId])).rows[0];
    if (!asset || !(await this.storage.exists(asset.storage_key))) throw new VideoError(404, "Video is not ready or its download has expired.");
    return asset;
  }
  // Starts an unpaid canary run that renders real tasks on the provider's own
  // node through the production protocol. The server measures every attempt
  // itself, so a provider cannot self-report speed or quality.
  async createQualification(ownerId, nodeId, requestedPreset) {
    await this.assertReady();
    const node = (await this.pool.query(`SELECT * FROM nodes WHERE id=$1 AND owner_id=$2`, [String(nodeId), ownerId])).rows[0];
    if (!node) throw new VideoError(404, "Node not found.");
    const presets = this.presetsFor(node);
    if (!presets.includes(REFERENCE_PRESET)) {
      throw new VideoError(422, `Video work needs an NVIDIA GPU with at least ${PRESETS[REFERENCE_PRESET].minVramGb} GB VRAM and ${PRESETS[REFERENCE_PRESET].minRamGb} GB RAM on Windows or Linux.`);
    }
    if (!node.active || !node.last_seen_at || new Date(node.last_seen_at) < Date.now() - 90_000) throw new VideoError(409, "Start the Decompute agent on this computer first.");
    const shotPresets = SHOT_PRESETS.filter((id) => presets.includes(id));
    if (requestedPreset && !shotPresets.includes(requestedPreset)) throw new VideoError(422, "This computer cannot run that video preset.");
    const shotPreset = requestedPreset || shotPresets[0] || null;
    await this.tx(async (client) => {
      await client.query(`SELECT id FROM nodes WHERE id=$1 FOR UPDATE`, [node.id]);
      const active = (await client.query(`SELECT 1 FROM video_projects WHERE kind='qualification' AND pinned_node_id=$1 AND settled_at IS NULL LIMIT 1`, [node.id])).rows[0];
      if (active) return; // one run at a time; repeating the request is harmless
      const recent = Number((await client.query(`SELECT count(*) AS count FROM video_projects WHERE kind='qualification' AND pinned_node_id=$1
        AND created_at > now() - interval '1 day'`, [node.id])).rows[0].count);
      if (recent >= QUALIFICATION_PROJECTS * 3) throw new VideoError(429, "This computer has already started three qualification runs today.");
      const runKey = crypto.randomUUID();
      // Smaller cards qualify for references and storyboards only.
      const runPresets = shotPreset ? [REFERENCE_PRESET, shotPreset] : [REFERENCE_PRESET];
      for (let index = 0; index < QUALIFICATION_PROJECTS; index++) {
        const { style, plan } = canaryPlan(index);
        const quote = { qualification: true, runKey, presetId: shotPreset || SHOT_PRESET, presets: runPresets,
          overheadMicros: 60_000, shotReserveMicros: 0, referenceReserveMicros: 0 };
        const project = (await client.query(`INSERT INTO video_projects
          (user_id,request_key,request_hash,prompt,duration_seconds,style,status,plan,quote,price_micros,compute_cap_micros,kind,pinned_node_id,expires_at)
          VALUES ($1,$2,$3,$4,30,$5,'rendering',$6,$7,0,0,'qualification',$8,now()+interval '12 hours') RETURNING id`,
          [ownerId, `qualify-${runKey}-${index}`, hash({ nodeId: node.id, runKey, index }), plan.title, style, JSON.stringify(plan), JSON.stringify(quote), node.id])).rows[0];
        for (const task of compileTasks(project.id, plan, { shotPreset: quote.presetId, includeShots: !!shotPreset })) await client.query(`INSERT INTO video_tasks
          (project_id,task_key,kind,shot_index,spec,dependencies) VALUES ($1,$2,$3,$4,$5,$6)`,
          [project.id, task.key, task.kind, task.shotIndex ?? null, JSON.stringify(task.spec), task.dependencies]);
      }
    });
    return this.qualificationStatus(ownerId, node.id);
  }
  async qualificationStatus(ownerId, nodeId) {
    const node = (await this.pool.query(`SELECT * FROM nodes WHERE id=$1 AND owner_id=$2`, [String(nodeId), ownerId])).rows[0];
    if (!node) throw new VideoError(404, "Node not found.");
    const records = (await this.pool.query(`SELECT * FROM video_qualifications WHERE node_id=$1`, [node.id])).rows;
    const latest = (await this.pool.query(`SELECT quote->>'runKey' AS run_key FROM video_projects WHERE kind='qualification' AND pinned_node_id=$1
      ORDER BY created_at DESC LIMIT 1`, [node.id])).rows[0];
    const projects = latest ? (await this.pool.query(`SELECT p.status,p.failure_reason,p.created_at,p.settled_at,
        count(t.id)::int AS tasks, (count(t.id) FILTER (WHERE t.status='done'))::int AS done
      FROM video_projects p LEFT JOIN video_tasks t ON t.project_id=p.id
      WHERE p.kind='qualification' AND p.pinned_node_id=$1 AND p.quote->>'runKey'=$2 GROUP BY p.id ORDER BY p.created_at`, [node.id, latest.run_key])).rows : [];
    const failed = projects.find((p) => p.settled_at && p.status !== "done");
    return {
      eligiblePresets: this.presetsFor(node),
      presets: Object.keys(PRESETS).map((presetId) => {
        const record = records.find((r) => r.preset_id === presetId), pinned = this.pinned(presetId);
        const current = !!record && !!pinned && record.image_digest === pinned.image && record.model_revision === pinned.revision && new Date(record.expires_at) > new Date();
        return { presetId, kind: PRESETS[presetId].kind, qualified: current && Number(record.acceptance) >= 0.8,
          p50Seconds: current ? Number(record.p50_seconds) : null, p95Seconds: current ? Number(record.p95_seconds) : null,
          acceptance: current ? Number(record.acceptance) : null, samples: current ? record.samples : 0, expiresAt: current ? record.expires_at : null };
      }),
      run: projects.length ? {
        status: projects.some((p) => !p.settled_at) ? "running" : failed ? "failed" : "done",
        tasks: projects.reduce((n, p) => n + p.tasks, 0), done: projects.reduce((n, p) => n + p.done, 0),
        startedAt: projects[0].created_at, failureReason: failed?.failure_reason || null,
      } : null,
    };
  }
  async purge() {
    const assets = (await this.pool.query(`SELECT a.* FROM video_assets a JOIN video_projects p ON p.id=a.project_id
      WHERE a.expires_at<now() AND p.settled_at IS NOT NULL LIMIT 100`)).rows;
    for (const asset of assets) { await this.storage.remove(asset.storage_key); await this.pool.query(`DELETE FROM video_assets WHERE id=$1`, [asset.id]); }
  }
}
