# Fixed-price video: operator runbook

Status as of October 16, 2026. The pipeline is built and tested end to end against fixtures and real ffmpeg, but **no GPU workload has run yet**. Every runtime, acceptance rate and cost figure below is an assumption until the first qualification runs report real numbers. Research, pricing rationale and sources are in [video-feasibility.md](video-feasibility.md).

## What a customer buys

A silent 1280×720 video of 5, 15 or 30 seconds for $0.12, $0.33 or $0.60, paid from wallet credit. The price is held when the project is created and refunded in full if the project fails, expires (2 hours) or is cancelled.

| Step | Where it runs | What checks it |
|---|---|---|
| Plan: visual bible, master reference prompt, one storyboard and motion prompt per 5 s shot | Gemini 3.1 Flash-Lite, structured JSON | Schema plus code validation; one repair call |
| Master reference image, then one storyboard per shot | Provider GPUs, SDXL + IP-Adapter | Decode check, then multimodal review against the brief |
| Each 5 s shot, conditioned on its storyboard | Provider GPUs, Wan 2.2 5B (30-step or distilled 3-step preset) | Full decode, exact 120 frames at 24 fps, frozen/blank rejection, multimodal review |
| Assembly | API server, ffmpeg | Exact frame count, full decode; lossless copy when shots match, re-encode otherwise |

Shots render in parallel on different machines. A failed or rejected shot is retried alone (at most 3 attempts) without discarding its siblings.

## The economics gate

The server only quotes an order when the measured cost of qualified workers fits the compute cap left after card fees (5.9% on a $10 top-up), overhead, and a 35% contribution margin. It checks both the expected cost and a worst-case first-pass reservation based on each worker's p95 runtime.

Run `node docs/video-cost-model.mjs` to see every scenario evaluated by the production admission code. With the current assumptions:

| Shot preset (assumed timing at $0.30/hr) | 5 s | 15 s | 30 s | Expected GPU cost for 30 s |
|---|---|---|---|---|
| Distilled 3-step, ~120 s p50 / 150 s p95 | quotes | quotes | quotes | $0.10 |
| 30-step, ~400 s p50 / 480 s p95 | refused | refused | refused | n/a |

The 30-step figure scales Wan's published "under nine minutes" for 50 steps on an RTX 4090. If that holds, **$0.60 is only reachable with the distilled preset**, or with providers well below $0.30/hr. Treat this as the main thing the first benchmark must settle.

The distilled preset is FastVideo's 3-step DMD distillation of the same model ([model card](https://huggingface.co/FastVideo/FastWan2.2-TI2V-5B-FullAttn-Diffusers), Apache-2.0). It is published for text-to-video; how well it follows a storyboard image is unverified. The qualification run and per-shot review measure exactly that, and a node whose results fall below 80% acceptance is never quoted.

## 1. Build and pin the images

Each image bakes its weights; provider machines never download models during a paid attempt.

```bash
docker build -t REGISTRY/video-reference job-templates/video-reference
docker build -t REGISTRY/video-gen job-templates/video-gen
docker build -t REGISTRY/video-gen-fast job-templates/video-gen \
  --build-arg MODEL_REPO=FastVideo/FastWan2.2-TI2V-5B-FullAttn-Diffusers \
  --build-arg MODEL_REVISION=3e187042a324f6f5fb68fd22110a78725253de8f \
  --build-arg PRESET=fastwan-2.2-5b-720-3-v1
docker push REGISTRY/video-reference   # repeat for each image
docker inspect --format '{{index .RepoDigests 0}}' REGISTRY/video-gen   # the digest to pin
```

The default revisions in each Dockerfile were checked against Hugging Face on October 16, 2026.

## 2. Configure the API server

Set these in the API's environment (template in `server/.env.example`):

| Variable | Value |
|---|---|
| `VIDEO_ENABLED` | `true` |
| `GEMINI_API_KEY` | Planner and reviewer key |
| `VIDEO_REFERENCE_IMAGE`, `VIDEO_REFERENCE_REVISION` | Reference image digest; SDXL revision `462165984030d82259a11f4367a4eed129e94a7b` |
| `VIDEO_SHOT_IMAGE`, `VIDEO_SHOT_REVISION` | 30-step image digest; Wan revision `b8fff7315c768468a5333511427288870b2e9635` |
| `VIDEO_FAST_SHOT_IMAGE`, `VIDEO_FAST_SHOT_REVISION` | Distilled image digest; FastWan revision `3e187042a324f6f5fb68fd22110a78725253de8f` |
| `VIDEO_STORAGE_DIR` | Shared persistent directory for shots and finished videos |

A preset is enabled only when both its digest and revision are set; the revision must equal the one baked into the image, or the container refuses the task. You can enable one or both shot presets. Each project uses one preset throughout, and the quote picks the cheapest qualified preset per accepted shot.

Then run `npm run migrate` (adds migrations 0017 and 0018).

### Deploying on Cloud Run

- **Storage.** Instance disks are per-instance and ephemeral. Mount a Cloud Storage bucket as a volume and point `VIDEO_STORAGE_DIR` at it.
- **Queue.** The queue runs every 10 seconds inside the API process, so the service needs CPU allocated outside requests (instance-based billing) and at least one minimum instance. Several instances are safe: projects are processed under expiring leases.
- **Uploads.** Shot uploads are capped at 16 MB, inside Cloud Run's request limit.
- **ffmpeg.** The server Dockerfile installs it.

## 3. Prepare provider machines

Each provider sets `DECOMPUTE_WORKLOAD_IMAGES` to the same digests under the agent's workload IDs, for example:

```json
{"video-reference": "REGISTRY/video-reference@sha256:…",
 "video-generation": "REGISTRY/video-gen@sha256:…",
 "video-generation-fast": "REGISTRY/video-gen-fast@sha256:…"}
```

Then they run `decompute-helper --prepare-video` once to download the images (tens of GB), keep the agent running, and press **Start video test** on their listing in the Provider Hub.

## 4. Qualification

The test is four canary projects (52 renders for a 24 GB card, 28 reference/storyboard renders for a 12–23 GB card) sent to that one node through the normal protocol. The server times each attempt itself and runs the same validation and review as production. It is unpaid and moves no money. Expect roughly 1–4 hours depending on the preset.

After 20 finished attempts per preset, the node gets a record (p50, p95, acceptance), valid for 14 days. Every later attempt refreshes it from the node's last 50 finished attempts, so slow or sloppy nodes drop out of quotes on their own. Hardware minimums: NVIDIA, Windows or Linux, 24 GB VRAM and 48 GB RAM for shots, 12 GB and 24 GB for references.

## 5. Before charging real money

These gates come from the feasibility study and are not yet met:

1. Run the canary test on at least two GPU classes (for example a rented 4090 for about $1 an hour) with both shot presets, and replace the assumed timings in `docs/video-cost-assumptions.json` with measured ones.
2. Have people rate a sample of canary shots. Today, acceptance is the automated review's judgment, which has not been calibrated against human ratings.
3. Confirm the first live planner call succeeds. The `responseJsonSchema` request format for Gemini 3.1 Flash-Lite has not been exercised against the live API; a mismatch fails at planning, before any GPU spend, with a full refund.
4. Run the forced-disconnect, late-upload and duplicate-completion checks on real hardware.

## Known limits and open decisions

- **Provider pay is time-based.** Pay is the provider's hourly rate times actual time, capped at the attempt's reservation. A per-shot rate at the node's measured median would make our cost fully predictable and remove any incentive to stall. That is a business decision, not yet made.
- **Qualification is unpaid.** Paying for it is a possible onboarding incentive (about $1 of GPU time per node) but invites farming.
- **Failed projects cost us.** A refund returns the full price while providers keep pay for legitimate work. The 35% margin absorbs this at the modeled ~95% project success rate.
- **Audio, dialogue and seamless continuation are out of scope.** Each shot is a deliberate cut.
