"""Real-cluster tests (no mocks). Uses a throwaway index and deletes it afterwards. Run: pytest tests -q"""

import secrets
import sys
import time
from pathlib import Path

import pytest
from elasticsearch import ApiError

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from boilerplate import common_phrases, set_stop_words, stop_words  # noqa: E402
from check import CheckError, analyze, check  # noqa: E402
from es import create_index, get_client  # noqa: E402

COPIED = (
    "the sensor assembly comprises a flexible substrate carrying a plurality of electrodes arranged in a "
    "regular grid pattern wherein each electrode is coupled to a shared readout line through a switch"
)  # 30 words
SHORT = "to avoid suspension of your account you must verify your payment details within twenty"  # 14 words -> 7 fingerprints
FILLER_A = "this patent describes an unrelated pump with a rotating impeller and a sealed housing for liquids"
COMMON = "as described in the preferred embodiment of the present invention"
FILLER_B = "a different filing about wireless antennas tuned to narrow frequency bands for portable radios"


def doc(title, body, coll="patents"):
    return {"title": title, "source": "test", "collection": coll, "body": body}


@pytest.fixture(scope="module")
def env():
    es, name = get_client(), f"fingerprint-demo-test-{secrets.token_hex(4)}"
    create_index(es, name)
    docs = [
        doc("A", f"{FILLER_A} {COPIED} {FILLER_B}"),
        doc(
            "B",
            f"{COMMON} {FILLER_B} {COMMON} and nothing else in common here at all today",
        ),
        doc("C", f"Dear customer, {SHORT}, thank you.", "phishing"),
        doc(
            "D",
            f"completely different text about gardening, tomatoes, compost and the best time to plant beans, {COMMON}",
        ),
    ]
    for i, d in enumerate(docs):
        es.index(index=name, id=str(i), document=d)
    es.indices.refresh(index=name)
    yield es, name
    es.indices.delete(index=name, ignore_unavailable=True)


def test_copied_passage_found_with_spans(env):
    es, name = env
    text = f"Hi all, please see this quote from the filing: {COPIED} Regards, Pat"
    res = check(es, name, text, "any")
    assert [m.title for m in res.matches] == ["A"]
    m = res.matches[0]
    assert m.longest_run == len(COPIED.split())
    assert [m.doc_text[s:e] for s, e in m.doc_spans] == [COPIED]
    assert [text[s:e] for s, e in m.input_spans] == [COPIED]
    assert m.matched == len(COPIED.split()) - 7


def test_unrelated_text_not_found(env):
    es, name = env
    assert (
        check(
            es,
            name,
            "Lunch on Friday? I booked a table for six near the station at one",
            "any",
        ).matches
        == []
    )


def test_min_shared_ignores_duplicates_in_query(env):
    es, name = env
    text = f"{SHORT} " * 3  # repeated phrase: still only the unique fingerprints count
    assert check(
        es, name, text, "min_shared", 7
    ).matches  # 14 words -> 7 unique fingerprints
    assert not check(es, name, text, "min_shared", 8).matches


def test_verified_run_filters_short_phrases(env):
    es, name = env
    assert check(es, name, SHORT, "any").matches  # 14-word overlap found by any
    assert not check(
        es, name, SHORT, "verified_run", 16
    ).matches  # but below a 16-word run
    assert check(es, name, COPIED, "verified_run", 16).matches


@pytest.fixture
def stop_words_of(env):
    """Apply stop words to the test index; wait until searches use them; clear them afterwards."""
    es, name = env

    def apply(phrases, probe):
        set_stop_words(es, name, phrases)
        # the index reopens: on Serverless, searches can fail (503) for a while before they use the new list
        for _ in range(90):
            try:
                if not es.search(index=name, query={"match": {"body": probe}})["hits"][
                    "hits"
                ]:
                    return
            except ApiError:
                pass
            time.sleep(1)
        raise AssertionError("stop words not applied within 90 s")

    yield apply
    set_stop_words(es, name, set())
    for _ in range(
        90
    ):  # wait until the reopened index answers again, so the next test isn't hit by a 503
        try:
            es.search(index=name, size=0)
            return
        except ApiError:
            time.sleep(1)


def test_common_phrases_as_stop_words(env, stop_words_of):
    es, name = env
    top = common_phrases(es, name, 2, 100)
    assert top and all(
        c == 2 for _, c in top
    )  # B and D share COMMON, A and B share FILLER_B
    assert {m.title for m in check(es, name, COMMON, "any").matches} == {"B", "D"}
    common = {p for p, _ in top if p in COMMON}
    stop_words_of(common, COMMON)
    assert stop_words(es, name) == common
    assert (
        check(es, name, COMMON, "any").matches == []
    )  # leak check ignores boilerplate
    classified = check(es, name, COMMON, "any", boilerplate=True).matches
    assert {m.title for m in classified} == {"B", "D"}  # classification still sees it


def test_stop_words_do_not_count_as_evidence(env, stop_words_of):
    es, name = env
    # B has COMMON directly followed by FILLER_B: a 13-word copied run, 10 words of it boilerplate
    text = f"{COMMON} {' '.join(FILLER_B.split()[:3])}"
    assert check(es, name, text, "verified_run", 12).matches
    stop_words_of({t["token"] for t in analyze(es, name, COMMON)}, COMMON)
    assert check(es, name, text, "verified_run", 12).matches == []
    m = check(es, name, text, "any").matches[0]
    # only the fingerprints that cross into FILLER_B remain: 10 words, highlighted on both sides
    assert m.title == "B" and m.longest_run == 10 and m.matched == 3
    tail = " ".join(text.split()[3:])
    assert [text[s:e] for s, e in m.input_spans] == [tail]
    assert [m.doc_text[s:e] for s, e in m.doc_spans] == [tail]


def test_run_must_be_unbroken_in_the_input(env):
    es, name = env
    w = COPIED.split()
    # two 10-word pieces that are adjacent in doc A, separated by other words in the input
    text = f"{' '.join(w[:10])} and then something else entirely {' '.join(w[10:20])}"
    m = check(es, name, text, "any").matches[0]
    assert m.title == "A" and m.longest_run == 10
    assert not check(es, name, text, "verified_run", 16).matches
    assert check(es, name, " ".join(w[:20]), "verified_run", 16).matches


def test_emoji_offsets(env):
    es, name = env
    text = f"\U0001f600\U0001f600 see \U0001f4ce {COPIED} \U0001f600"
    m = check(es, name, text, "any").matches[0]
    assert [text[s:e] for s, e in m.input_spans] == [COPIED]


def test_short_and_too_long_input(env):
    es, name = env
    res = check(es, name, "hello world", "any")
    assert res.fingerprints == 0 and res.matches == []
    with pytest.raises(CheckError):
        check(es, name, "word " * 10500, "any")


def test_create_index_refuses_existing(env):
    es, name = env
    with pytest.raises(SystemExit):
        create_index(es, name)


def test_query_sends_the_whole_text(env):
    es, name = env
    text = f"Hi all, please see this quote from the filing: {COPIED} Regards, Pat"
    res = check(es, name, text, "any")
    assert res.query["query"] == {"match": {"body": {"query": text}}}
    assert res.query["highlight"]["fields"]["body"]["type"] == "unified"
    q = check(es, name, text, "min_shared", 5).query["query"]
    assert q["match"]["body"] == {"query": text, "minimum_should_match": 5}


def test_guard_blocks_copied_prompt_and_allows_clean_one(env):
    from guard import screen

    es, name = env
    leak = [
        {"role": "user", "content": f"Make this simpler: {COPIED}"},
        {"role": "assistant", "content": "Sure, here it is."},
        {"role": "user", "content": "Now one sentence please."},
    ]
    v = screen(es, name, leak, "min_shared", 3)
    assert not v.allowed and [m["title"] for m in v.matches] == ["A"]
    assert v.matches[0]["copied"] == [COPIED]
    clean = [
        {
            "role": "user",
            "content": "Write a short poem about tomatoes and compost in spring.",
        }
    ]
    assert screen(es, name, clean, "min_shared", 3).allowed


def test_guard_fails_closed_on_errors(env):
    from guard import screen

    es, _ = env
    msgs = [{"role": "user", "content": COPIED}]
    assert not screen(es, "no-such-index-xyz", msgs).allowed
    assert screen(es, "no-such-index-xyz", msgs, fail_open=True).allowed


def test_verified_run_counts_tokens_for_chinese(env):
    es, name = env
    cjk = "这是一个机密文档，包含公司的内部战略计划和未发布的产品路线图，请勿外传"
    es.index(index=name, id="cjk", document=doc("CJK", cjk, "own"), refresh=True)
    try:
        res = check(es, name, f"请看：{cjk}", "verified_run", 16)
        assert [m.title for m in res.matches] == ["CJK"]
        assert res.matches[0].longest_run >= 30  # one token per character
    finally:
        es.delete(index=name, id="cjk", refresh=True)


def test_guard_checks_every_role_and_content_parts(env):
    from guard import screen

    es, name = env
    for msgs in (
        [{"role": "system", "content": COPIED}],
        [{"role": "user", "content": [{"type": "input_text", "text": COPIED}]}],
    ):
        assert not screen(es, name, msgs, "min_shared", 3).allowed


def test_unknown_rule_rejected(env):
    es, name = env
    with pytest.raises(ValueError):
        check(es, name, COPIED, "bogus")
