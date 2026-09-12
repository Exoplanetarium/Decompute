FROM pytorch/pytorch:2.11.0-cuda12.8-cudnn9-runtime
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/* \
 && pip install --no-cache-dir --break-system-packages faster-whisper==1.1.1
WORKDIR /app
COPY transcribe.py .
ENTRYPOINT ["python", "transcribe.py"]
