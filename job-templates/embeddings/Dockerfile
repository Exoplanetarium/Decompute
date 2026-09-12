FROM pytorch/pytorch:2.11.0-cuda12.8-cudnn9-runtime
RUN pip install --no-cache-dir --break-system-packages sentence-transformers==3.0.1
WORKDIR /app
COPY embed.py .
ENTRYPOINT ["python", "embed.py"]
