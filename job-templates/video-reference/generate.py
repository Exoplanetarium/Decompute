"""One SDXL master reference or IP-Adapter-conditioned storyboard image."""
import argparse
import json
import os
from pathlib import Path
import time


def validate_spec(spec):
    if spec.get("kind") not in ("reference", "storyboard") or spec.get("presetId") != "sdxl-ipadapter-v1":
        raise ValueError("Unsupported reference preset")
    if not os.environ.get("MODEL_REVISION") or spec.get("modelRevision") != os.environ["MODEL_REVISION"]:
        raise ValueError("Model revision differs from the compiled assignment")
    for key in ("prompt", "visualBible"):
        if not isinstance(spec.get(key), str) or not 3 <= len(spec[key]) <= 1200:
            raise ValueError("Invalid reference prompt")
    if type(spec.get("seed")) is not int or not 0 <= spec["seed"] <= 0xFFFFFFFF:
        raise ValueError("Invalid seed")


def generate(spec, input_dir, output_dir):
    started = time.perf_counter()
    validate_spec(spec)
    import torch
    from PIL import Image, ImageOps
    from diffusers import StableDiffusionXLPipeline
    from transformers import CLIPVisionModelWithProjection

    if not torch.cuda.is_available():
        raise RuntimeError("CUDA GPU required")
    pipe = StableDiffusionXLPipeline.from_pretrained(os.environ.get("MODEL_DIR", "/opt/model"),
        torch_dtype=torch.float16, use_safetensors=True, local_files_only=True)
    kwargs = {}
    if spec["kind"] == "storyboard":
        inputs = sorted(Path(input_dir).glob("*.png"))
        if len(inputs) != 1:
            raise ValueError("Exactly one approved master reference is required")
        adapter = os.environ.get("ADAPTER_DIR", "/opt/adapter")
        pipe.image_encoder = CLIPVisionModelWithProjection.from_pretrained(adapter, subfolder="models/image_encoder",
            torch_dtype=torch.float16, local_files_only=True)
        pipe.load_ip_adapter(adapter, subfolder="sdxl_models", weight_name="ip-adapter-plus_sdxl_vit-h.safetensors",
            image_encoder_folder=None, local_files_only=True)
        # Plus keeps the master's character and palette across storyboards; the
        # plain adapter let colours and costumes drift shot to shot (benchmarked
        # on Modal, October 2026). It can duplicate the subject, hence the
        # negative prompt below and the reviewer's duplicate check.
        pipe.set_ip_adapter_scale(0.7)
        kwargs["ip_adapter_image"] = Image.open(inputs[0]).convert("RGB")
    pipe.enable_model_cpu_offload()
    pipe.vae.enable_tiling()
    loaded = time.perf_counter()
    # SDXL's CLIP encoders read only 77 tokens. The planner writes a short,
    # self-contained prompt; prefixing the visual bible would push it past the
    # cut-off. Storyboards inherit identity from the IP-Adapter reference.
    image = pipe(prompt=spec["prompt"],
        negative_prompt="text, watermark, malformed anatomy, low quality, duplicate, two of the same character, multiple copies", width=1280, height=704,
        num_inference_steps=25, guidance_scale=6.0,
        generator=torch.Generator(device="cpu").manual_seed(spec["seed"]), **kwargs).images[0]
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    ImageOps.fit(image, (1280, 704)).save(Path(output_dir) / "result.png")
    torch.cuda.synchronize()
    metrics = {"presetId": "sdxl-ipadapter-v1", "kind": spec["kind"], "modelRevision": spec["modelRevision"],
        "loadSeconds": loaded - started, "totalSeconds": time.perf_counter() - started,
        "peakVramBytes": torch.cuda.max_memory_allocated(), "gpu": torch.cuda.get_device_name(0)}
    print("DECOMPUTE_BENCHMARK=" + json.dumps(metrics), flush=True)
    return metrics


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--spec-file")
    parser.add_argument("--input-dir", default="/input")
    parser.add_argument("--output-dir", default="/output")
    args = parser.parse_args()
    raw = Path(args.spec_file).read_text() if args.spec_file else os.environ.get("DECOMPUTE_VIDEO_SPEC", "")
    generate(json.loads(raw), args.input_dir, args.output_dir)
