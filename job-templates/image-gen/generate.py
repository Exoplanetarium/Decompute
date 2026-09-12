import os
import shutil
import sys
import tempfile
import zipfile

import torch
from diffusers import StableDiffusionPipeline

MODEL_ID = "CompVis/stable-diffusion-v1-4"

# Production images bake the weights in (see this template's Dockerfile) and
# run with no network at all, so load from disk whenever that copy exists.
# Falling back to the Hub id keeps a locally-built image usable for
# development, where the agent still allows egress.
MODEL_DIR = os.environ.get("MODEL_DIR", "/opt/model")


def log(msg):
    print(msg, flush=True)


def main():
    # Job submission prefixes every field with DECOMPUTE_ and uppercases it
    # (see the envVars-building code in NewJobModal/QuickStartLauncher) —
    # "prompts" arrives as DECOMPUTE_PROMPTS, not "prompts".
    prompt_raw = os.environ.get("DECOMPUTE_PROMPTS", "").strip()
    if not prompt_raw:
        log("ERROR: no prompt provided (expected the DECOMPUTE_PROMPTS env var)")
        sys.exit(1)
    prompts = [p.strip() for p in prompt_raw.splitlines() if p.strip()]

    requested_style = os.environ.get("DECOMPUTE_MODEL", "unspecified")
    log(f"Requested style: {requested_style} (this template currently always renders with Stable Diffusion 1.4, regardless of style)")

    try:
        count_per_prompt = int(os.environ.get("DECOMPUTE_COUNT_PER_PROMPT", "1"))
    except ValueError:
        count_per_prompt = 1
    count_per_prompt = max(1, min(16, count_per_prompt))
    try:
        base_seed = int(os.environ.get("DECOMPUTE_SEED", "0")) & 0xFFFFFFFF
    except ValueError:
        base_seed = 0

    total = len(prompts) * count_per_prompt
    log(f"{len(prompts)} prompt(s) x {count_per_prompt} image(s) each = {total} image(s) total")
    model_source = MODEL_DIR if os.path.isdir(MODEL_DIR) else MODEL_ID
    log(f"Loading {model_source}...")
    pipe = StableDiffusionPipeline.from_pretrained(
        model_source,
        torch_dtype=torch.float16,
        safety_checker=None,
        requires_safety_checker=False,
    )
    pipe = pipe.to("cuda")
    log("Model loaded. Generating...")

    os.makedirs("/output", exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp_dir:
        paths = []
        done = 0
        for prompt_idx, prompt in enumerate(prompts, start=1):
            for copy_idx in range(1, count_per_prompt + 1):
                done += 1
                log(f"[{done}/{total}] \"{prompt}\"")
                seed = (base_seed + done - 1) & 0xFFFFFFFF
                generator = torch.Generator(device="cuda").manual_seed(seed)
                image = pipe(prompt, num_inference_steps=30, generator=generator).images[0]
                path = os.path.join(tmp_dir, f"prompt{prompt_idx:02d}_{copy_idx:02d}.png")
                image.save(path)
                paths.append(path)

        # The upload side (helper/internal/agent/agent.go) grabs a single
        # file out of /output, so a single image stays a plain .png — only
        # multiple images need zipping into that one file.
        if len(paths) == 1:
            out_path = "/output/result.png"
            # The scratch dir is on the sandbox's tmpfs and /output is a bind
            # mount — different devices, so os.replace/rename fails with
            # EXDEV. shutil.move falls back to copying when that happens.
            shutil.move(paths[0], out_path)
        else:
            out_path = "/output/result.zip"
            with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as zf:
                for path in paths:
                    zf.write(path, os.path.basename(path))
        log(f"Saved {out_path} ({len(paths)} image(s))")


if __name__ == "__main__":
    main()
