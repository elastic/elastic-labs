"""LLM proxy that blocks prompts copying protected text. OpenAI-style endpoint, standard library only.

Run:   python proxy.py            (listens on http://localhost:8787)
Point a chat client at http://localhost:8787/v1/chat/completions. Allowed requests go to the LLM behind the
Elasticsearch inference API (GUARD_INFERENCE_ID). Responses:
  403 protected_content    the prompt copies protected text (matched documents and copied passages included)
  503 guard_unavailable    the check failed (cluster down, text too long); 200 instead with GUARD_FAIL_OPEN=true
  400 invalid_request      not JSON, or no message text
  502 llm_error            the model call failed
Settings in .env: GUARD_RULE (any | min_shared | verified_run), GUARD_N, GUARD_INFERENCE_ID, GUARD_FAIL_OPEN.
"""

import json
import os
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from es import get_client, index_name
from guard import forward, screen, user_text

ES, INDEX = get_client(), index_name()
FAIL_OPEN = os.environ.get("GUARD_FAIL_OPEN", "false").lower() in ("true", "1", "yes")
PORT = int(os.environ.get("GUARD_PORT", "8787"))
MAX_BYTES = 2_000_000


def error(kind: str, message: str, **extra) -> dict:
    return {"error": {"type": kind, "message": message, **extra}}


def parse(raw: bytes) -> list[dict]:
    """The request's messages, or ValueError with a reason the client can act on."""
    try:
        req = json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        raise ValueError(f"body is not JSON: {e}") from e
    messages = req.get("messages") if isinstance(req, dict) else None
    if not isinstance(messages, list) or not all(isinstance(m, dict) for m in messages):
        raise ValueError('"messages" must be a list of message objects')
    if not user_text(messages).strip():
        raise ValueError("the messages contain no text")
    return messages


class Handler(BaseHTTPRequestHandler):
    def _send(self, status: int, body: dict) -> None:
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):  # noqa: N802
        self._send(405, error("invalid_request", "use POST /v1/chat/completions"))

    def do_POST(self):  # noqa: N802
        if self.path != "/v1/chat/completions":
            return self._send(404, error("invalid_request", "not found"))
        size = int(self.headers.get("Content-Length") or 0)
        if not 0 < size <= MAX_BYTES:
            return self._send(
                400,
                error(
                    "invalid_request",
                    f"send a JSON body with Content-Length up to {MAX_BYTES} bytes",
                ),
            )
        try:
            messages = parse(self.rfile.read(size))
        except ValueError as e:
            return self._send(400, error("invalid_request", str(e)))
        v = screen(ES, INDEX, messages, fail_open=FAIL_OPEN)
        self.log_message(
            "guard %s in %.0f ms: %s", "allow" if v.allowed else "BLOCK", v.ms, v.reason
        )
        if not v.allowed:
            if v.error:
                return self._send(
                    503,
                    error(
                        "guard_unavailable",
                        f"Request blocked: {v.reason}",
                        guard_ms=round(v.ms, 1),
                    ),
                )
            return self._send(
                403,
                error(
                    "protected_content",
                    f"Request blocked: {v.reason}",
                    matches=v.matches,
                    guard_ms=round(v.ms, 1),
                ),
            )
        t0 = time.perf_counter()
        try:
            answer = forward(ES, messages)
        except (
            Exception
        ) as e:  # noqa: BLE001  inference endpoint missing, model error, timeout
            return self._send(502, error("llm_error", f"{type(e).__name__}: {e}"[:500]))
        self._send(
            200,
            {
                "id": f"chatcmpl-{uuid.uuid4().hex[:12]}",
                "object": "chat.completion",
                "created": int(time.time()),
                "model": "guarded",
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
