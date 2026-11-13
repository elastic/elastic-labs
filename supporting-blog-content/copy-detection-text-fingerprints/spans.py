"""Small helpers for highlight tags and character spans."""

PRE, POST = "\ue000", "\ue001"  # private-use characters, cannot clash with real text


def parse_marked(marked: str) -> tuple[str, list[tuple[int, int]]]:
    """Strip highlight tags; return (plain text, char spans of the marked parts)."""
    plain, spans, start, depth = [], [], 0, 0
    for ch in marked:
        if ch == PRE:
            if depth == 0:
                start = len(plain)
            depth += 1
        elif ch == POST:
            depth -= 1
            if depth == 0:
                spans.append((start, len(plain)))
        else:
            plain.append(ch)
    return "".join(plain), spans


def es_offsets(text: str):
    """Elasticsearch offsets count UTF-16 code units, Python strings count characters (code points). Return a
    function mapping an Elasticsearch offset in `text` to a Python index (identity when there are no emoji etc.).
    """
    if all(ord(c) <= 0xFFFF for c in text):
        return lambda o: o
    table = []
    for i, c in enumerate(text):
        table.append(i)
        if ord(c) > 0xFFFF:  # two UTF-16 code units, one Python character
            table.append(i)
    table.append(len(text))
    return lambda o: table[min(o, len(table) - 1)]


def merge(spans: list[tuple[int, int]], text: str) -> list[tuple[int, int]]:
    """Merge spans that overlap or are separated only by whitespace (for display)."""
    out: list[tuple[int, int]] = []
    for s, e in sorted(spans):
        if out and (s <= out[-1][1] or not text[out[-1][1] : s].strip()):
            out[-1] = (out[-1][0], max(out[-1][1], e))
        else:
            out.append((s, e))
    return out


def longest_run(positions: list[int], k: int = 8) -> int:
    """Longest unbroken copied run, in words (tokens), from the positions of the shared k-word fingerprints.
    A fingerprint at position p covers words p..p+k-1, so fingerprints whose words overlap form one run. Counting
    tokens rather than spaces also works for Chinese and Japanese, where each character is a token.
    """
    best, start, end = 0, None, None
    for p in sorted(set(positions)):
        if end is not None and p < end:
            end = p + k
        else:
            start, end = p, p + k
        best = max(best, end - start)
    return best


def mark(
    text: str, spans: list[tuple[int, int]], pre: str = "[[", post: str = "]]"
) -> str:
    out, cur = [], 0
    for s, e in spans:
        out += [text[cur:s], pre, text[s:e], post]
        cur = e
    out.append(text[cur:])
    return "".join(out)
