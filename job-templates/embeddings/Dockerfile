FROM pytorch/pytorch:2.11.0-cuda12.8-cudnn9-runtime
RUN pip install --no-cache-dir --break-system-packages sentence-transformers==3.0.1
# Same constraint as the image-gen template: the agent runs any image
# configured through DECOMPUTE_WORKLOAD_IMAGES with --network=none, so the
# weights must already be here. chmod because safetensors writes 0600 and the
# sandbox runs as a non-root uid that isn't the build user.
ENV MODEL_DIR=/opt/model
RUN python -c "from sentence_transformers import SentenceTransformer; \
SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2').save('/opt/model')" \
 && chmod -R a+rX /opt/model
ENV HF_HUB_OFFLINE=1

WORKDIR /app
COPY embed.py .
ENTRYPOINT ["python", "embed.py"]
