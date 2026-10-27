"""LLM guard: check a chat request for copied protected text before it leaves for an LLM.

screen(es, index, messages) runs the same check() as the UI on the text of the user messages and returns a
Verdict. forward(es, messages) sends an allowed request to an LLM through the Elasticsearch inference API
(any chat model you have an inference endpoint for), so the guard and the model sit behind one API key.
"""

import os
import time
from dataclasses import dataclass, field

from check import CheckError, check

RULE = os.environ.get("GUARD_RULE", "min_shared")
N = int(os.environ.get("GUARD_N", "3"))
INFERENCE_ID = os.environ.get(
    "GUARD_INFERENCE_ID", ".anthropic-claude-4.5-haiku-completion"
)


@dataclass
class Verdict:
    allowed: bool
    reason: str
    ms: float  # time spent in the check
    # [{"id", "title", "collection", "shared", "longest_run", "copied"}]
    matches: list = field(default_factory=list)


def user_text(messages: list[dict]) -> str:
    """Text of every user message. Chat clients resend the history, so earlier turns are checked again (cheap)."""
    parts = []
    for m in messages:
        if m.get("role") != "user":
            continue
        c = m.get("content", "")
        if isinstance(c, list):  # OpenAI content parts: keep the text parts
            c = "\n".join(p.get("text", "") for p in c if p.get("type") == "text")
        parts.append(c)
    return "\n\n".join(parts)


def screen(
    es,
    index: str,
    messages: list[dict],
    rule: str = RULE,
    n: int = N,
    fail_open: bool = False,
) -> Verdict:
    """Allow or block a chat request. Errors block unless fail_open (a guard that is down should not leak)."""
    text = user_text(messages)
    t0 = time.perf_counter()
    try:
        res = check(es, index, text, rule, n, size=5) if text.strip() else None
    except CheckError as e:
        return Verdict(False, f"not checked: {e}", (time.perf_counter() - t0) * 1000)
    except Exception as e:  # noqa: BLE001  cluster unreachable, timeout, ...
        ms = (time.perf_counter() - t0) * 1000
        return Verdict(
            fail_open, f"guard error ({type(e).__name__}), fail_open={fail_open}", ms
        )
    ms = (time.perf_counter() - t0) * 1000
    if not res or not res.matches:
        return Verdict(True, "no protected text found", ms)
    matches = [
        {
            "id": m.id,
            "title": m.title,
            "collection": m.collection,
            "shared": m.matched,
            "longest_run": m.longest_run,
            "copied": [text[s:e] for s, e in m.input_spans][:3],
        }
        for m in res.matches
    ]
    return Verdict(False, f"copies {len(matches)} protected document(s)", ms, matches)


def forward(es, messages: list[dict], inference_id: str = INFERENCE_ID) -> str:
    """Send the conversation to an LLM through the inference API (completion task: the turns as one prompt)."""
    prompt = "\n\n".join(
        f"{m.get('role', 'user')}: {m.get('content', '')}" for m in messages
    )
    resp = es.inference.completion(inference_id=inference_id, input=prompt)
    return resp["completion"][0]["result"]
