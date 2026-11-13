"""Example inputs for the UI. Passages are taken from the loaded index, so they always match what is protected."""

import json
import re

from es import HERE

UNRELATED = (
    "Hi Sam, can we move Thursday's planning meeting to the afternoon? I have a dentist appointment in the "
    "morning. Please bring the updated budget spreadsheet and the draft schedule for the offsite, and let "
    "me know if the room is free after lunch. Thanks, Alex"
)


def _body(es, index: str, collection: str) -> str:
    """Body of one document of `collection`, or of any non-phishing document (e.g. your own files)."""
    for q in (
        {"term": {"collection": collection}},
        {"bool": {"must_not": {"term": {"collection": "phishing"}}}},
    ):
        hits = es.search(index=index, size=1, query=q, _source=["body"])["hits"]["hits"]
        if hits:
            return hits[0]["_source"]["body"]
    return ""


def _edit(text: str) -> str:
    """Light edit: replace every 13th word, so copied runs of about 12 words survive between the edits."""
    words = text.split()
    return " ".join("various" if i % 13 == 3 else w for i, w in enumerate(words))


def _passage(body: str, start_word: int = 150, min_words: int = 30) -> str:
    """Whole sentences from about `start_word` on, at least `min_words` long, so the example reads naturally."""
    sentences, words, out = re.split(r"(?<=[.!?])\s+", body), 0, []
    for s in sentences:
        n = len(s.split())
        if words >= start_word or out:
            out.append(s)
            if sum(len(x.split()) for x in out) >= min_words:
                return " ".join(out)
        words += n
    return " ".join(body.split()[start_word : start_word + 40])


def build(es, index: str) -> dict[str, str]:
    passage = _passage(_body(es, index, "patents"))
    templates = json.loads((HERE / "data/phishing_templates.json").read_text())
    scam = (
        templates[0]["body"]
        .replace("Dear customer,", "Hello,")
        .replace("twenty four hours", "24 hours")
    )
    return {
        "Email quoting a document": (
            f"Hi Priya, here is the paragraph I mentioned from the partner's filing: {passage} "
            f"Can you tell me if this overlaps with our draft? Thanks, Jo"
            if passage
            else UNRELATED
        ),
        "Edited version": (
            f"Hi Priya, a paragraph from their filing, lightly reworded: {_edit(passage)} "
            f"Does this overlap with our draft? Thanks, Jo"
            if passage
            else UNRELATED
        ),
        "Phishing-like email": f"Subject: Action required\n\n{scam}\n\nhttp://example.invalid/verify",
        "Unrelated email": UNRELATED,
    }
