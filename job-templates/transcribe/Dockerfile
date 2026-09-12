FROM pytorch/pytorch:2.11.0-cuda12.8-cudnn9-runtime
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/* \
 && pip install --no-cache-dir --break-system-packages faster-whisper==1.1.1
# Same constraint as the image-gen template: the agent runs any image
# configured through DECOMPUTE_WORKLOAD_IMAGES with --network=none, so the
# weights must already be here. chmod because safetensors writes 0600 and the
# sandbox runs as a non-root uid that isn't the build user.
ENV MODEL_DIR=/opt/model
RUN python -c "from huggingface_hub import snapshot_download; \
snapshot_download('Systran/faster-whisper-small', local_dir='/opt/model')" \
 && chmod -R a+rX /opt/model
ENV HF_HUB_OFFLINE=1

WORKDIR /app
COPY transcribe.py .
ENTRYPOINT ["python", "transcribe.py"]
