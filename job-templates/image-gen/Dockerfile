# Real, working stand-in for the "Generate images" template — renders with
# Stable Diffusion 1.4 (CreativeML OpenRAIL-M, publicly downloadable, no
# gated-access token needed). Model weights download from Hugging Face on
# first run rather than being baked into the image, which keeps the build
# itself small; a production template would bake them in instead so a job's
# billed runtime isn't spent on a multi-GB download.
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

WORKDIR /app
COPY generate.py .

ENTRYPOINT ["python", "generate.py"]
