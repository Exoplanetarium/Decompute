import glob
import json
import os
import sys

from faster_whisper import WhisperModel


def main():
    files = sorted(path for path in glob.glob("/input/*") if os.path.isfile(path))
    if not files:
        raise RuntimeError("no audio input was mounted")
    language = os.environ.get("DECOMPUTE_LANGUAGE", "auto")
    include_timestamps = os.environ.get("DECOMPUTE_INCLUDE_TIMESTAMPS", "true").lower() == "true"
    # Production images bake the weights in and run without network; the size
    # name is the development fallback, where egress is still allowed.
    model_dir = os.environ.get("MODEL_DIR", "/opt/model")
    model_source = model_dir if os.path.isdir(model_dir) else "small"
    model = WhisperModel(model_source, device="cuda", compute_type="float16", download_root=os.environ.get("HF_HOME"))
    all_segments = []
    texts = []
    for file_index, path in enumerate(files):
        segments, info = model.transcribe(path, language=None if language == "auto" else language, beam_size=5)
        for segment in segments:
            text = segment.text.strip()
            texts.append(text)
            all_segments.append({
                "fileIndex": file_index,
                "start": round(segment.start, 3) if include_timestamps else 0,
                "end": round(segment.end, 3) if include_timestamps else 0,
                "text": text,
            })
        print(f"transcribed {os.path.basename(path)} ({info.language})", flush=True)
    result = {"schemaVersion": 1, "kind": "transcription", "text": " ".join(texts), "segments": all_segments}
    os.makedirs("/output", exist_ok=True)
    with open("/output/result.json", "w", encoding="utf-8") as handle:
        json.dump(result, handle, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr, flush=True)
        raise
