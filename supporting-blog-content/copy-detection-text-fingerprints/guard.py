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
    error: bool = False  # True when the check itself failed (not a match)
    # [{"id", "title", "collection", "shared", "longest_run", "copied"}]
    matches: list = field(default_factory=list)


def content_text(content) -> str:
    """Text of one message content: a string, or OpenAI-style parts (text parts kept, images etc. skipped)."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(
            p.get("text", "")
            for p in content
            if isinstance(p, dict) and isinstance(p.get("text"), str)
        )
    return ""


def user_text(messages: list[dict]) -> str:
    """Text of every message, whatever its role: the client controls the whole history it sends (system and
    assistant turns included), and earlier turns are resent each time, so all of it is checked.
    """
    return "\n\n".join(content_text(m.get("content")) for m in messages)


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
        res = check(es, index, text, rule, n) if text.strip() else None
    except CheckError as e:
        ms = (time.perf_counter() - t0) * 1000
        return Verdict(False, f"not checked: {e}", ms, error=True)
    except Exception as e:  # noqa: BLE001  cluster unreachable, timeout, ...
        ms = (time.perf_counter() - t0) * 1000
        reason = f"guard error ({type(e).__name__}), fail_open={fail_open}"
        return Verdict(fail_open, reason, ms, error=True)
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
    return Verdict(
        False, f"copies {len(matches)} protected document(s)", ms, matches=matches
    )


def forward(es, messages: list[dict], inference_id: str = INFERENCE_ID) -> str:
    """Send the conversation to an LLM through the inference API (completion task: the turns as one prompt)."""
    prompt = "\n\n".join(
        f"{m.get('role', 'user')}: {content_text(m.get('content'))}" for m in messages
    )
    resp = es.inference.completion(inference_id=inference_id, input=prompt)
    return resp["completion"][0]["result"]
