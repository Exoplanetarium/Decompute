FROM pytorch/pytorch:2.8.0-cuda12.8-cudnn9-runtime
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt
# One template, one image per shot preset. The default is the 30-step Wan
# preset; the distilled 3-step preset is built from the same files with:
#   --build-arg MODEL_REPO=FastVideo/FastWan2.2-TI2V-5B-FullAttn-Diffusers
#   --build-arg MODEL_REVISION=3e187042a324f6f5fb68fd22110a78725253de8f
#   --build-arg PRESET=fastwan-2.2-5b-720-3-v1
ARG MODEL_REPO=Wan-AI/Wan2.2-TI2V-5B-Diffusers
ARG MODEL_REVISION=b8fff7315c768468a5333511427288870b2e9635
ARG PRESET=wan-2.2-5b-720-30-v1
ENV MODEL_REPO=${MODEL_REPO} MODEL_REVISION=${MODEL_REVISION} PRESET=${PRESET} MODEL_DIR=/opt/model
RUN python -c "import os; from huggingface_hub import snapshot_download; snapshot_download(os.environ['MODEL_REPO'], revision=os.environ['MODEL_REVISION'], local_dir='/opt/model', ignore_patterns=['*.md','*.png','*.jpg','*.JPG','*.mp4','test.txt'])" \
    && chmod -R a+rX /opt/model
ENV HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 TOKENIZERS_PARALLELISM=false
WORKDIR /app
COPY generate.py .
ENTRYPOINT ["python", "/app/generate.py"]
