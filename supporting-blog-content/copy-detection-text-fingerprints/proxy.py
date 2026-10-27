"""LLM proxy that blocks prompts copying protected text. OpenAI-style endpoint, standard library only.

Run:   python proxy.py            (listens on http://localhost:8787)
Point a chat client at http://localhost:8787/v1/chat/completions. Allowed requests go to the LLM behind the
Elasticsearch inference API (GUARD_INFERENCE_ID); blocked ones get HTTP 403 with the matched documents.
Settings in .env: GUARD_RULE (any | min_shared | verified_run), GUARD_N, GUARD_INFERENCE_ID, GUARD_FAIL_OPEN.
"""

import json
import os
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from es import get_client, index_name
from guard import forward, screen

ES, INDEX = get_client(), index_name()
FAIL_OPEN = os.environ.get("GUARD_FAIL_OPEN", "false").lower() == "true"
PORT = int(os.environ.get("GUARD_PORT", "8787"))


class Handler(BaseHTTPRequestHandler):
    def _send(self, status: int, body: dict) -> None:
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):  # noqa: N802
        if self.path != "/v1/chat/completions":
            return self._send(404, {"error": {"message": "not found"}})
        req = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
        messages = req.get("messages", [])
        v = screen(ES, INDEX, messages, fail_open=FAIL_OPEN)
        self.log_message(
            "guard %s in %.0f ms: %s", "allow" if v.allowed else "BLOCK", v.ms, v.reason
        )
        if not v.allowed:
            return self._send(
                403,
                {
                    "error": {
                        "type": "protected_content",
                        "message": f"Request blocked: {v.reason}",
                        "matches": v.matches,
                        "guard_ms": round(v.ms, 1),
                    }
                },
            )
        t0 = time.perf_counter()
        answer = forward(ES, messages)
        self._send(
            200,
            {
                "id": f"chatcmpl-{uuid.uuid4().hex[:12]}",
                "object": "chat.completion",
                "created": int(time.time()),
                "model": req.get("model", "guarded"),
                "choices": [
                    {
                        "index": 0,
                        "finish_reason": "stop",
                        "message": {"role": "assistant", "content": answer},
                    }
                ],
                "guard": {
                    "ms": round(v.ms, 1),
                    "llm_ms": round((time.perf_counter() - t0) * 1000, 1),
                },
            },
        )


if __name__ == "__main__":
    print(f"Guarding index '{INDEX}' on http://localhost:{PORT}/v1/chat/completions")
    ThreadingHTTPServer(("localhost", PORT), Handler).serve_forever()
