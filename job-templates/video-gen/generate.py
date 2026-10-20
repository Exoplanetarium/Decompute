"""Pinned Wan image-to-video workload. One input image, one five-second MP4.

One script serves both shot presets; the image's baked PRESET picks which.
The 30-step preset is a shortened schedule of the base model, an optimization
candidate rather than a measured quality claim; 50 steps are available to the
offline benchmark only. The 3-step preset is FastVideo's DMD distillation of
the same model, sampled the way it was distilled: predict the clean video at
three fixed noise levels, re-noising in between, without classifier-free
guidance. Production admission is tied to the exact image digest and each
node's measured qualification record, never to this file's intentions.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time


PRESETS = {
    "wan-2.2-5b-720-30-v1": {"steps": (30,), "benchmark_steps": (30, 50), "guidance": 5.0, "sigmas": None},
    "fastwan-2.2-5b-720-3-v1": {"steps": (3,), "benchmark_steps": (3,), "guidance": 1.0, "sigmas": (1.0, 0.757, 0.522)},
}
PRESET = os.environ.get("PRESET", "wan-2.2-5b-720-30-v1")


def validate_spec(spec, benchmark=False):
    preset = PRESETS.get(PRESET)
    if preset is None or spec.get("kind") != "shot" or spec.get("presetId") != PRESET:
        raise ValueError("Unsupported video preset")
    expected = {"width": 1280, "height": 704, "frames": 121, "keepFrames": 120, "fps": 24}
    if any(spec.get(key) != value for key, value in expected.items()):
        raise ValueError("Video dimensions/timing do not match the qualified preset")
    steps = spec.get("steps", preset["steps"][0])
    if steps not in (preset["benchmark_steps"] if benchmark else preset["steps"]):
        raise ValueError("Unsupported step count")
    for key in ("prompt", "visualBible"):
        if not isinstance(spec.get(key), str) or not 3 <= len(spec[key]) <= 1200:
            raise ValueError("Invalid video prompt")
    if type(spec.get("seed")) is not int or not 0 <= spec["seed"] <= 0xFFFFFFFF:
        raise ValueError("Invalid seed")
    revision = os.environ.get("MODEL_REVISION", "")
    if not revision or spec.get("modelRevision") != revision:
        raise ValueError("Model revision differs from the compiled assignment")
    return steps


def load_pipeline(source, preset):
    import torch
    from diffusers import AutoencoderKLWan, WanImageToVideoPipeline

    vae = AutoencoderKLWan.from_pretrained(source, subfolder="vae", torch_dtype=torch.float32, local_files_only=True)
    if preset["sigmas"] is None:
        # expand_timesteps is required for the Wan 2.2 5B I2V first-frame mask.
        return WanImageToVideoPipeline.from_pretrained(source, vae=vae, torch_dtype=torch.bfloat16,
            image_encoder=None, image_processor=None, expand_timesteps=True, local_files_only=True)
    # The distilled repository's model_index may name a FastVideo-only class,
    # so the standard pipeline is assembled from its components instead.
    from diffusers import FlowMatchEulerDiscreteScheduler, WanTransformer3DModel
    from transformers import AutoTokenizer, UMT5EncoderModel

    # shift=1 keeps the fixed noise levels exactly as distilled; stochastic
    # sampling predicts x0 and re-noises to the next level, ending on x0.
    scheduler = FlowMatchEulerDiscreteScheduler(num_train_timesteps=1000, shift=1.0, stochastic_sampling=True)
    set_timesteps = scheduler.set_timesteps
    scheduler.set_timesteps = lambda num_inference_steps=None, device=None, **_: set_timesteps(
        sigmas=list(preset["sigmas"]), device=device)
    return WanImageToVideoPipeline(
        tokenizer=AutoTokenizer.from_pretrained(source, subfolder="tokenizer", local_files_only=True),
        text_encoder=UMT5EncoderModel.from_pretrained(source, subfolder="text_encoder", torch_dtype=torch.bfloat16, local_files_only=True),
        vae=vae, scheduler=scheduler, expand_timesteps=True,
        transformer=WanTransformer3DModel.from_pretrained(source, subfolder="transformer", torch_dtype=torch.bfloat16, local_files_only=True))


def generate(spec, input_dir, output_dir, benchmark=False):
    started = time.perf_counter()
    steps = validate_spec(spec, benchmark)
    preset = PRESETS[PRESET]
    import torch
    from PIL import Image, ImageOps
    from diffusers.utils import export_to_video

    if not torch.cuda.is_available():
        raise RuntimeError("CUDA GPU required")
    inputs = sorted(Path(input_dir).glob("*.png"))
    if len(inputs) != 1:
        raise ValueError("Exactly one approved storyboard PNG is required")
    image = ImageOps.fit(Image.open(inputs[0]).convert("RGB"), (1280, 704))
    pipe = load_pipeline(os.environ.get("MODEL_DIR", "/opt/model"), preset)
    # No VAE tiling: in diffusers 0.35.1 the tiled encode/decode paths skip the
    # Wan 2.2 VAE's patchify step and crash on the 5B model's 12-channel input.
    pipe.enable_model_cpu_offload()
    torch.backends.cuda.matmul.allow_tf32 = True
    loaded = time.perf_counter()
    generator = torch.Generator(device="cpu").manual_seed(spec["seed"])
    # Stochastic re-noising draws from the global RNG rather than `generator`;
    # seeding it keeps a network retry's render identical to the original.
    torch.manual_seed(spec["seed"])
    # Action first: umT5 reads 512 tokens, so any truncation trims the shared
    # visual bible rather than the shot's motion.
    frames = pipe(image=image, prompt=spec["prompt"] + "\n" + spec["visualBible"],
        negative_prompt="text, subtitles, watermark, low quality, distorted anatomy, flicker, frozen image",
        width=1280, height=704, num_frames=121, num_inference_steps=steps,
        guidance_scale=preset["guidance"], generator=generator).frames[0]
    torch.cuda.synchronize()
    rendered = time.perf_counter()
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="video-encode-") as temporary:
        intermediate = str(Path(temporary) / "native.mp4")
        export_to_video(frames[:120], intermediate, fps=24, quality=8, macro_block_size=1)
        # A 2.3% vertical resample to 720 lines is imperceptible; padding left
        # visible black bars on every delivered video.
        subprocess.run(["ffmpeg", "-v", "error", "-i", intermediate, "-an", "-vf", "scale=1280:720:flags=lanczos",
            "-frames:v", "120", "-r", "24", "-c:v", "libx264", "-preset", "fast", "-crf", "20",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-y", str(Path(output_dir) / "result.mp4")],
            check=True, timeout=60)
    metrics = {"presetId": PRESET, "steps": steps, "modelRevision": spec["modelRevision"],
        "loadSeconds": loaded - started, "renderSeconds": rendered - loaded,
        "totalSeconds": time.perf_counter() - started,
        "peakVramBytes": torch.cuda.max_memory_allocated(), "gpu": torch.cuda.get_device_name(0)}
    print("DECOMPUTE_BENCHMARK=" + json.dumps(metrics), flush=True)
    return metrics


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--spec-file")
    parser.add_argument("--input-dir", default="/input")
    parser.add_argument("--output-dir", default="/output")
    parser.add_argument("--benchmark", action="store_true")
    args = parser.parse_args()
    raw = Path(args.spec_file).read_text() if args.spec_file else os.environ.get("DECOMPUTE_VIDEO_SPEC", "")
    generate(json.loads(raw), args.input_dir, args.output_dir, args.benchmark)
