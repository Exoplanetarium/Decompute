import express, { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireAgentAuth } from "../middleware/requireAgentAuth.js";
import { videoService } from "../lib/video/runtime.js";
import { VideoError, usd } from "../lib/video/policy.js";

export function createVideoRouters(service = videoService) {
  const router = Router(), agentRouter = Router();
  const mutate = rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false });
  const poll = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false });
  router.use(poll);
  router.get("/capabilities", async (req, res) => res.json({ data: {
    configured: service.configured(), durations: [5,15,30], prices: { 5: 0.12, 15: 0.33, 30: 0.60 },
    width: 1280, height: 720, fps: 24, audio: false,
  } }));
  router.use(requireAuth);
  router.post("/quote", mutate, async (req, res) => {
    const quote = await service.quote(req.body?.durationSeconds);
    res.json({ data: { ...quote, priceUsd: usd(quote.priceMicros) } });
  });
  // Providers qualify their own nodes; registered before /:id so the paths
  // can never be read as a video identifier.
  router.post("/qualifications", mutate, async (req, res) => res.status(202).json({
    data: await service.createQualification(req.userId, req.body?.nodeId, typeof req.body?.presetId === "string" ? req.body.presetId : undefined) }));
  router.get("/qualifications/:nodeId", async (req, res) => res.json({ data: await service.qualificationStatus(req.userId, req.params.nodeId) }));
  router.post("/", mutate, async (req, res) => res.status(201).json({ data: await service.create(req.userId, req.body, req.headers["idempotency-key"]) }));
  router.get("/", async (req, res) => res.json({ data: await service.list(req.userId) }));
  router.get("/:id", async (req, res) => res.json({ data: await service.get(req.userId, req.params.id) }));
  router.post("/:id/cancel", mutate, async (req, res) => res.json({ data: await service.cancel(req.userId, req.params.id) }));
  const sendAsset = (asset, res, next) => {
    res.setHeader("Content-Type", asset.content_type);
    res.setHeader("Content-Length", asset.byte_size);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Decompute-Sha256", asset.sha256);
    const stream = service.storage.stream(asset.storage_key);
    stream.on("error", next);
    stream.pipe(res);
  };
  router.get("/:id/artifact", async (req, res, next) => {
    const asset = await service.artifact(req.userId, req.params.id);
    res.setHeader("Content-Disposition", 'attachment; filename="decompute-video.mp4"');
    sendAsset(asset, res, next);
  });
  agentRouter.use(requireAgentAuth);
  agentRouter.post("/job/:id/claim", async (req, res) => { await service.claim(req.nodeId, req.params.id); res.json({ ok: true }); });
  agentRouter.get("/job/:id/input/:inputId", async (req, res, next) => sendAsset(await service.input(req.nodeId, req.params.id, req.params.inputId), res, next));
  agentRouter.post("/job/:id/artifact", express.raw({ type: "application/octet-stream", limit: "16mb" }), async (req, res) => {
    const contentType = String(req.headers["x-decompute-result-content-type"] || "").split(";")[0];
    const asset = await service.upload(req.nodeId, req.params.id, contentType, req.body, req.headers["x-decompute-sha256"]);
    res.json({ data: { id: asset.id, sha256: asset.sha256 } });
  });
  agentRouter.post("/job/:id/complete", async (req, res) => {
    await service.finishAttempt(req.nodeId, req.params.id, req.body?.status, typeof req.body?.errorMessage === "string" ? req.body.errorMessage : null);
    res.json({ ok: true });
  });
  // Node liveness still uses /api/agent/heartbeat. Per-task telemetry does not
  // extend the hard execution deadline or decide provider compensation.
  for (const kind of ["heartbeats", "logs"]) agentRouter.post(`/job/:id/${kind}`, async (req, res) => {
    await service.attempt(req.nodeId, req.params.id); res.json({ ok: true });
  });
  const errors = (error, req, res, next) => {
    if (error instanceof VideoError) return res.status(error.status).json({ error: error.message });
    next(error);
  };
  router.use(errors); agentRouter.use(errors);
  return { router, agentRouter };
}
export const { router: videoRouter, agentRouter: videoAgentRouter } = createVideoRouters();
