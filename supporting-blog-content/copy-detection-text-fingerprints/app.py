"""Mini UI: paste text, see which protected documents it copies from, with copied words highlighted.
Run: streamlit run app.py
"""

import html

import streamlit as st
from elasticsearch import ApiError, TransportError

import examples
from boilerplate import common_phrases, set_stop_words, stop_words
from check import CheckError, check
from es import get_client, index_name

st.set_page_config(page_title="Fingerprint copy check", layout="wide")
# Text boxes follow the theme (dark by default in .streamlit/config.toml; run with --theme.base light for light)
LIGHT = st.get_option("theme.base") == "light"
BOX = ("#f5f7fa", "#c9d2e3", "#1c1e23") if LIGHT else ("#161b26", "#3a4258", "#f2f4f8")
MARK = "#48efcf" if LIGHT else "#ffb454"
st.markdown(
    f"""<style>
html, body, [class*="css"], .stTextArea textarea {{ font-size: 19px !important; }}
.box {{ background:{BOX[0]}; border:1px solid {BOX[1]}; border-radius:8px; padding:14px; line-height:1.65;
       white-space:pre-wrap; max-height:420px; overflow:auto; color:{BOX[2]}; }}
mark {{ background:{MARK}; color:#10131a; padding:1px 2px; border-radius:3px; font-weight:600; }}
</style>""",
    unsafe_allow_html=True,
)


@st.cache_resource
def client():
    return get_client()


@st.cache_data(show_spinner=False)
def cached_stop_words(index: str) -> set[str]:
    return stop_words(client(), index)


@st.cache_data(show_spinner=False)
def cached_examples(index: str) -> dict[str, str]:
    return examples.build(client(), index)


def render(text: str, spans: list[tuple[int, int]], limit: int | None = None) -> str:
    """HTML with copied spans in <mark>. For long documents show only the area around the copied passages."""
    if limit and len(text) > limit and spans:
        a, b = max(0, spans[0][0] - 400), min(len(text), spans[-1][1] + 400)
        text, spans = text[a:b], [(s - a, e - a) for s, e in spans if e > a and s < b]
        spans = [(max(s, 0), min(e, len(text))) for s, e in spans]
    out, cur = [], 0
    for s, e in spans:
        out += [html.escape(text[cur:s]), "<mark>", html.escape(text[s:e]), "</mark>"]
        cur = e
    out.append(html.escape(text[cur:]))
    return f'<div class="box">{"".join(out)}</div>'


def apply_stop_words(phrases: set[str]) -> None:
    with st.spinner("Updating the search analyzer (the index reopens)..."):
        try:
            set_stop_words(client(), idx, phrases)
        except (ValueError, RuntimeError) as e:
            st.session_state.stop_error = str(e)
    cached_stop_words.clear()


idx = index_name()
st.title("Copy check with stock Elasticsearch")
try:
    exists = client().indices.exists(index=idx)
except (SystemExit, ConnectionError, ApiError, TransportError) as e:
    st.error(f"Cannot reach Elasticsearch: {e}. Check ES_URL and ES_API_KEY in .env.")
    st.stop()
if not exists:
    st.error(
        f"Index '{idx}' not found. Load the sample data first: `python load_data.py` "
        "(or set INDEX_NAME in .env)."
    )
    st.stop()
st.caption(
    f"Index: {idx}. Each protected document is stored as overlapping 8-word phrases (fingerprints)."
)

if "text" not in st.session_state:
    st.session_state.text = ""
with st.sidebar:
    st.header("Match rule")
    rules = {
        "Any shared fingerprint": "any",
        "At least N shared fingerprints": "min_shared",
        "Verified run of at least N words": "verified_run",
    }
    rule = rules[st.radio("Rule", list(rules), index=1)]
    n = 3
    if rule == "min_shared":
        n = st.slider("N (fingerprints)", 1, 30, 3)
    elif rule == "verified_run":
        n = st.slider("N (words)", 8, 60, 16)
    stop = cached_stop_words(idx)
    st.header("Boilerplate")
    st.write(f"{len(stop)} phrases are stop words (see the Common phrases tab).")
    boilerplate = st.toggle(
        "Count boilerplate too (classification)",
        help="Match with the index analyzer, so stop-word phrases count again.",
    )

tab_check, tab_common = st.tabs(["Check text", "Common phrases (boilerplate)"])

with tab_check:
    cols = st.columns(4)
    ex = cached_examples(idx)
    for col, (label, body) in zip(cols, ex.items()):
        if col.button(label, width="stretch"):
            st.session_state.text = body
    text = st.text_area("Text to check", key="text", height=190)
    # Any button click reruns the script with the latest text, so this just gives the rerun a visible trigger.
    st.button(":material/search: Check text", type="primary")
    st.caption(
        "Edit the text, then select Check text (or press Ctrl+Enter / Cmd+Enter in the box)."
    )
    res = None
    if text.strip():
        try:
            res = check(client(), idx, text, rule, n, stop, boilerplate)
        except CheckError as e:
            st.error(str(e))
    if res and not res.fingerprints:
        st.info(
            "No fingerprints to check: the text needs at least 8 words in a row "
            "(boilerplate stop-word phrases do not count)."
        )
    elif res:
        st.subheader(f"{len(res.matches)} protected document(s) matched")
        st.write(f"Input has {res.fingerprints} distinct fingerprints.")
        for m in res.matches:
            with st.container(border=True):
                st.markdown(f"### {m.title}  \n`{m.collection}`")
                a, b, c = st.columns(3)
                a.metric("Score", f"{m.score:.1f}")
                b.metric("Shared fingerprints", m.matched)
                c.metric("Longest copied run", f"{m.longest_run} words")
                left, right = st.columns(2)
                left.markdown("**Your text**")
                left.markdown(render(text, m.input_spans), unsafe_allow_html=True)
                right.markdown("**Protected document**")
                right.markdown(
                    render(m.doc_text, m.doc_spans, limit=2500), unsafe_allow_html=True
                )
        with st.expander("Query JSON"):
            st.caption(
                "The whole text is sent in a match query. The body field's search analyzer turns it into 8-word "
                "fingerprints on the server and drops boilerplate stop words. The unified highlighter marks the "
                "copied words in the protected document; _analyze marks them in your text."
            )
            st.json(res.query, expanded=True)

with tab_common:
    st.write(
        "Phrases shared by many protected documents. They cause false alarms in leak checks. Apply them as stop "
        "words: the search analyzer then drops them, while the index keeps them for classification."
    )
    min_docs = st.slider("Minimum documents", 2, 50, 5, key="mind")
    if st.button("Find common phrases"):
        st.session_state.common = common_phrases(client(), idx, min_docs, 200)
    rows = st.session_state.get("common", [])
    if err := st.session_state.pop("stop_error", None):
        st.error(err)
    if rows:
        st.dataframe(
            [{"phrase": p, "documents": d} for p, d in rows],
            width="stretch",
            height=300,
        )
        if st.button(f"Apply these {len(rows)} phrases as stop words", type="primary"):
            apply_stop_words(stop | {p for p, _ in rows})
            st.rerun()
    if stop:
        st.write(f"Current stop words: {len(stop)}")
        st.dataframe([{"phrase": p} for p in sorted(stop)], width="stretch", height=200)
        if st.button("Clear stop words"):
            apply_stop_words(set())
            st.rerun()
