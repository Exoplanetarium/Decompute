# HTTP wrapper around verify.py, so the Decompute server can re-check every
# docking result a volunteer uploads before accepting it. POST /verify with a
# result.json body returns the same {"items": [...]} that verify.py writes to
# verify.json. A body that can't be verified at all (malformed JSON, a pose
# Vina can't read) gets a 400, which the server treats as a failed check.
#
# Single-threaded on purpose: dock.v is one shared Vina object, so two
# requests must never use it at once (Cloud Run runs this with
# --concurrency 1). Importing verify imports dock, which loads the receptor
# and computes the grid maps once at startup.
import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

import verify

MAX_BODY_BYTES = 25 * 1024 * 1024


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_json(200, {"ok": True})

    def do_POST(self):
        if self.path != "/verify":
            return self.send_json(404, {"error": "Not found"})
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY_BYTES:
            return self.send_json(413, {"error": "Body missing or too large"})
        try:
            result = json.loads(self.rfile.read(length))
            entries = []
            # Same loop as verify.py's __main__: failed molecules have no pose.
            for item in result["items"]:
                if "error" not in item:
                    index, check, score, rescore = verify.verify(item)
                    entries.append({"index": index, "ok": bool(check), "reported": score, "rescored": float(rescore)})
        except Exception as e:
            return self.send_json(400, {"error": f"Result couldn't be verified: {e}"})
        self.send_json(200, {"items": entries})

    def send_json(self, status, body):
        data = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    print(f"verifier listening on :{port}", flush=True)
    HTTPServer(("", port), Handler).serve_forever()
