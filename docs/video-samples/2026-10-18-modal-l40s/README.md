# Video benchmark run: Modal L40S, 2026-10-18

Four canary projects (3D robot, realistic fox, stop-motion paper boat, anime cat), 3 shots each, 30-step preset (`wan-2.2-5b-720-30-v1`). Run with `docs/video-bench/video_bench.py --phase full --presets base`, then checked with `check.mjs` and stitched with `assemble.mjs`.

- `video-subject{0..3}-15s.mp4`: assembled 15 s videos
- `sN-shot-M-base.mp4`: individual 5 s shots; `-sheet.jpg` is storyboard + 5 frames
- `sN-reference.png`, `sN-storyboard-M.png`: master and storyboard images
- `report.json`: per-render timings, VRAM, validator result; `run.log`: raw Modal output

## Results

All 28 renders succeeded and passed the production validator.

| Task | Wall time per render | Peak VRAM |
|---|---|---|
| Master / storyboard image (SDXL + IP-Adapter) | 14–22 s | 5.2–6.0 GB |
| 5 s shot, 30 steps | 316–347 s (render ~303–316 s) | 23.0 GB |

The whole run took 13 min end to end on up to 6 parallel L40S containers. Modal billed $3.29: L40S $2.59, memory $0.63, CPU $0.07.
