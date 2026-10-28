"""Core logic: is this text copied from a protected document? Uses stock Elasticsearch only.

check(es, index, text, rule, n):
  1. ONE search: a plain `match` with the whole text. The field's search analyzer turns it into fingerprints
     (8-word phrases) on the server and drops boilerplate phrases listed as stop words (see boilerplate.py).
     minimum_should_match = N for min_shared. The unified highlighter marks the copied words in each matched
     protected document, using the offsets stored in the index.
  2. _analyze the text with the index analyzer -> its fingerprints with offsets, to mark the copied words in the
     input too (the stop words from the index settings are removed here as well).
Rules are checked on distinct shared fingerprints (the match query counts a phrase repeated in the input each time):
  "any" (>= 1), "min_shared" (>= N), "verified_run" (an unbroken copied run of >= N words in the input:
  consecutive shared fingerprints overlap, so a chain of them is one copied passage).
boilerplate=True counts boilerplate too (classification): the match uses the index analyzer instead.
"""

from dataclasses import dataclass, field

from elasticsearch import BadRequestError

from spans import PRE, POST, es_offsets, longest_run, merge, parse_marked

ANALYZER = "fingerprint_8"
RULES = ("any", "min_shared", "verified_run")
DEFAULT_N = {"any": 1, "min_shared": 3, "verified_run": 16}
HIGHLIGHT = {
    "fields": {
        "body": {
            "type": "unified",
            "number_of_fragments": 0,  # the whole document, with every copied passage marked
            "pre_tags": [PRE],
            "post_tags": [POST],
        }
    }
}


class CheckError(Exception):
    """A problem with the input that the user can fix (too long, too many fingerprints)."""


@dataclass
class Match:
    id: str
    title: str
    collection: str
    score: float
    matched: int  # distinct shared fingerprints
    longest_run: int  # words in the longest unbroken copied passage of the input
    doc_text: str
    doc_spans: list = field(default_factory=list)  # char spans in the matched doc
    input_spans: list = field(default_factory=list)  # char spans in the input text


@dataclass
class Result:
    rule: str
    n: int
    fingerprints: (
        int  # distinct fingerprints in the input (boilerplate stop words removed)
    )
    text: str
    matches: list
    query: dict


def analyze(es, index: str, text: str | list[str]) -> list[dict]:
    """Fingerprints of `text` with char offsets and positions, using the index analyzer. A list is analyzed as
    separate values, so no fingerprint spans two of them."""
    try:
        return es.indices.analyze(index=index, analyzer=ANALYZER, text=text)["tokens"]
    except BadRequestError as e:
        if "max_token_count" in str(e) or "allowed maximum" in str(e):
            raise CheckError(
                "The text is too long: Elasticsearch analyzes at most 10,000 tokens per request. "
                "Check a shorter part (a few thousand words)."
            ) from e
        raise


def build_query(text: str, n: int = 1, boilerplate: bool = False) -> dict:
    match = {"query": text}
    if n > 1:
        match["minimum_should_match"] = n
    if boilerplate:
        match["analyzer"] = ANALYZER  # the index analyzer: no stop words
    return {"match": {"body": match}}


def check(
    es,
    index: str,
    text: str,
    rule: str = "any",
    n: int | None = None,
    stop_words: set[str] | None = None,
    boilerplate: bool = False,
    size: int = 20,
) -> Result:
    """Find protected documents that share fingerprints with `text` under the chosen rule.
    stop_words: the index's boilerplate list (boilerplate.stop_words); read from the index when None.
    """
    from boilerplate import stop_words as read_stop_words

    if rule not in RULES:
        raise ValueError(f"unknown rule {rule!r}, expected one of {RULES}")
    n = DEFAULT_N[rule] if n is None else n
    if boilerplate:
        stop = set()
    else:
        stop = read_stop_words(es, index) if stop_words is None else stop_words
    tokens = [t for t in analyze(es, index, text) if t["token"] not in stop]
    fps = {t["token"] for t in tokens}
    need = n if rule == "min_shared" else 1
    query = build_query(text, need, boilerplate)
    if not fps:
        return Result(rule, n, 0, text, [], {"query": query})
    try:
        resp = es.search(
            index=index,
            size=size,
            query=query,
            highlight=HIGHLIGHT,
            _source=["title", "collection"],
        )
    except BadRequestError as e:
        if "too_many" in str(e) or "maxClauseCount" in str(e):
            raise CheckError(
                f"The text has {len(fps)} distinct fingerprints, more query clauses than this cluster allows "
                "(the limit depends on the node's heap and search thread pool). Check a shorter part."
            ) from e
        raise
    to_py = es_offsets(text)
    matches = []
    for h in resp["hits"]["hits"]:
        doc_text, dspans = parse_marked(h.get("highlight", {}).get("body", [""])[0])
        dspans = merge(dspans, doc_text)
        # shared = fingerprints of the highlighted passages (short) that are also in the input
        passages = [doc_text[s:e] for s, e in dspans]
        shared = (
            {t["token"] for t in analyze(es, index, passages)} & fps
            if passages
            else set()
        )
        in_spans = [
            (to_py(t["start_offset"]), to_py(t["end_offset"]))
            for t in tokens
            if t["token"] in shared
        ]
        run = longest_run([t["position"] for t in tokens if t["token"] in shared])
        if len(shared) < need or (rule == "verified_run" and run < n):
            continue
        matches.append(
            Match(
                h["_id"],
                h["_source"].get("title", ""),
                h["_source"].get("collection", ""),
                h["_score"],
                len(shared),
                run,
                doc_text,
                dspans,
                merge(in_spans, text),
            )
        )
    return Result(
        rule, n, len(fps), text, matches, {"query": query, "highlight": HIGHLIGHT}
    )
