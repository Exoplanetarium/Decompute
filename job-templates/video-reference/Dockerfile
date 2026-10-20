FROM pytorch/pytorch:2.8.0-cuda12.8-cudnn9-runtime
RUN pip install --no-cache-dir diffusers==0.35.1 transformers==4.56.2 accelerate==1.10.1 \
    huggingface-hub==0.34.4 safetensors==0.6.2 Pillow==11.3.0
ARG MODEL_REVISION=462165984030d82259a11f4367a4eed129e94a7b
ARG ADAPTER_REVISION=018e402774aeeddd60609b4ecdb7e298259dc729
ENV MODEL_REVISION=${MODEL_REVISION} ADAPTER_REVISION=${ADAPTER_REVISION} MODEL_DIR=/opt/model ADAPTER_DIR=/opt/adapter
RUN python -c "import os, torch; from diffusers import StableDiffusionXLPipeline; from huggingface_hub import snapshot_download; StableDiffusionXLPipeline.from_pretrained('stabilityai/stable-diffusion-xl-base-1.0', revision=os.environ['MODEL_REVISION'], variant='fp16', torch_dtype=torch.float16, use_safetensors=True).save_pretrained('/opt/model'); snapshot_download('h94/IP-Adapter', revision=os.environ['ADAPTER_REVISION'], local_dir='/opt/adapter', allow_patterns=['sdxl_models/ip-adapter-plus_sdxl_vit-h.safetensors','models/image_encoder/*'])" \
    && chmod -R a+rX /opt/model /opt/adapter
ENV HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 TOKENIZERS_PARALLELISM=false
WORKDIR /app
COPY generate.py .
ENTRYPOINT ["python", "/app/generate.py"]
