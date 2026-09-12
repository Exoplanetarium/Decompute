# Real, working stand-in for the "Generate images" template — renders with
# Stable Diffusion 1.4 (CreativeML OpenRAIL-M, publicly downloadable, no
# gated-access token needed).
#
# Weights are baked in at build time, not downloaded on first run. The agent
# runs any image configured through DECOMPUTE_WORKLOAD_IMAGES with
# --network=none (see helper/internal/workload/policy.go), so a runtime
# download cannot work there at all — and baking also keeps a renter's billed
# runtime from being spent pulling multiple GB.
#
# Needs a recent PyTorch/CUDA build: newer GPUs (e.g. RTX 50-series/
# Blackwell, compute capability 12.0) have no compiled kernels in older
# images like 2.4.1-cuda12.1 ("CUDA error: no kernel image is available for
# execution on the device") even though the driver itself supports them.
FROM pytorch/pytorch:2.11.0-cuda12.8-cudnn9-runtime

RUN pip install --no-cache-dir --break-system-packages \
    diffusers==0.30.0 \
    transformers==4.44.2 \
    accelerate==0.33.0

# Saving an fp16-only copy of the pipeline keeps this around 2GB rather than
# the ~8GB the upstream repo's full set of variants would occupy. No GPU is
# needed to load and re-save the weights, so this works on a plain builder.
ENV MODEL_DIR=/opt/model
RUN python -c "import torch; from diffusers import StableDiffusionPipeline; \
StableDiffusionPipeline.from_pretrained('CompVis/stable-diffusion-v1-4', \
torch_dtype=torch.float16, safety_checker=None, requires_safety_checker=False \
).save_pretrained('/opt/model')"

# Nothing should reach for the Hub at run time; the pipeline is loaded from
# MODEL_DIR. This keeps a stray lookup from stalling on a dead network.
ENV HF_HUB_OFFLINE=1

WORKDIR /app
COPY generate.py .

ENTRYPOINT ["python", "generate.py"]
