import hashlib
import json
import os
import sys

from sentence_transformers import SentenceTransformer

MODEL_ID = "sentence-transformers/all-MiniLM-L6-v2"


def main():
    texts = [line.strip() for line in os.environ.get("DECOMPUTE_TEXTS", "").splitlines() if line.strip()]
    if not texts or len(texts) > 1024:
        raise RuntimeError("provide between 1 and 1024 non-empty text lines")
    normalize = os.environ.get("DECOMPUTE_NORMALIZE", "true").lower() == "true"
    # Production images bake the weights in and run without network; the Hub
    # id is the development fallback, where egress is still allowed.
    model_dir = os.environ.get("MODEL_DIR", "/opt/model")
    model_source = model_dir if os.path.isdir(model_dir) else MODEL_ID
    model = SentenceTransformer(model_source, device="cuda", cache_folder=os.environ.get("HF_HOME"))
    vectors = model.encode(texts, normalize_embeddings=normalize, batch_size=64).tolist()
    result = {
        "schemaVersion": 1,
        "kind": "embeddings",
        "model": MODEL_ID,
        "dimensions": len(vectors[0]),
        "items": [
            {"index": index, "textHash": hashlib.sha256(text.encode()).hexdigest(), "embedding": vector}
            for index, (text, vector) in enumerate(zip(texts, vectors))
        ],
    }
    os.makedirs("/output", exist_ok=True)
    with open("/output/result.json", "w", encoding="utf-8") as handle:
        json.dump(result, handle, separators=(",", ":"))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr, flush=True)
        raise
