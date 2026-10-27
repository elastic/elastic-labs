# Copy detection with text fingerprints

Find text copied from your protected documents, using stock Elasticsearch with no plugin. Protected documents are
indexed as overlapping 8-word phrases ("fingerprints"). Paste any text, such as an email or a prompt, and the demo
shows which protected documents it copies from, with the copied words highlighted on both sides.

This folder accompanies the Elasticsearch Labs post "Catch data leaks in emails and GenAI prompts with Elasticsearch
text fingerprinting". It works on Elastic Cloud (Serverless or hosted) and on self-managed Elasticsearch 9.x.

## What you get
- A web interface (Streamlit) to check text against the protected documents, switch match rules, and see the copied
  words, the number of shared phrases, and the longest copied run.
- 2,000 sample patent descriptions (the "protected documents") and 8 fictional phishing templates.
- A boilerplate finder that lists phrases shared by many documents and applies them as stop words.
- A command-line checker, and tests that run against your cluster.

## Quickstart

### 1. Get an Elasticsearch endpoint
Any Elasticsearch 9.x deployment works. Pick one:
- **Elastic Cloud:** start a [free trial](https://cloud.elastic.co/registration), create a Serverless
  Elasticsearch project (or a hosted deployment), and copy its Elasticsearch endpoint URL.
- **On your laptop:** with Docker installed, run `curl -fsSL https://elastic.co/start-local | sh`. It starts
  Elasticsearch and Kibana locally, on `http://localhost:9200`, and creates an API key for you.

### 2. Create an API key
In Kibana, open the API keys page (search for "API keys") and create a key. A key with your own privileges works.
To limit it to this demo, give it this role descriptor; `fingerprint-demo*` covers the demo index and the throwaway
indices the tests create:

```json
{
  "fingerprint_demo": {
    "indices": [{"names": ["fingerprint-demo*"], "privileges": ["all"]}]
  }
}
```

The demo creates and deletes its index, loads documents, searches, analyzes text, reads term vectors, and updates
the index's analysis settings when you apply stop words, so it needs full rights on its own index.

### 3. Install
Python 3.10 or later:

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp env.example .env
```

Edit `.env` and set `ES_URL` (the endpoint from step 1) and `ES_API_KEY` (the encoded key from step 2). Leave
`INDEX_NAME=fingerprint-demo` unless you want another name. Values in `.env` take precedence over shell variables.

### 4. Load the sample data
```bash
python load_data.py
```

The first run downloads one BigPatent parquet shard from Hugging Face (about 130 MB), then indexes 2,000 patents and
8 phishing templates, which takes about a minute. It ends with `loaded 2008 documents into 'fingerprint-demo'`.
A warning about unauthenticated Hugging Face requests is harmless.

### 5. Start the interface
```bash
streamlit run app.py
```

Open http://localhost:8501. The interface is dark by default; add `--theme.base light` for a light theme.

### 6. Things to try
- Select **Email quoting a document**: one patent matches, and the copied paragraph is highlighted in the email and
  in the patent.
- Select **Edited version**: a word is replaced every 13 words. With the default rule, **At least N shared
  fingerprints** (N = 3), it still matches. Switch to **Verified run of at least N words** with N = 16 and it stops
  matching, because the edits break the copied run; lower N to 12 and it matches again.
- Edit any example in the text box and select **Check text** to see how each edit affects the match.
- Select **Phishing-like email**: a reworded copy of a phishing template still matches the template.
- Open the **Common phrases (boilerplate)** tab, select **Find common phrases**, then **Apply these phrases as stop
  words**. Leak checks now ignore those phrases. Turn on **Count boilerplate too (classification)** in the sidebar to
  count them again, and select **Clear stop words** to undo.
- Use your own documents instead: `python load_data.py --recreate --from-folder <folder>` (`.txt` and `.md` files).

### 7. Clean up
```bash
python cleanup.py
```

This deletes the index. Delete `.env` when you're done, because it holds your API key.

## Command reference
```bash
python load_data.py                          # 2,000 patents + 8 phishing templates
python load_data.py --patents 500            # fewer patents
python load_data.py --from-folder ~/docs     # your own .txt / .md files instead (cut at about 9,000 tokens each)
python load_data.py --recreate               # replace an existing index (without it, an existing index is kept)
streamlit run app.py                         # the interface on http://localhost:8501
python cli.py --file email.txt --rule min_shared --n 3
python cli.py "paste text here" --rule verified_run --n 16
cat email.txt | python cli.py --rule any
python cli.py --file email.txt --boilerplate # count boilerplate stop words too (classification)
python stopwords.py --find 5                 # phrases in >= 5 documents
python stopwords.py --apply 5                # make them stop words (reopens the index)
python stopwords.py --show                   # list the current stop words
python stopwords.py --clear                  # remove all stop words
pytest tests -q                              # tests against your cluster, on throwaway fingerprint-demo-test-* indices
python proxy.py                              # LLM guard proxy on http://localhost:8787/v1/chat/completions
python cleanup.py                            # delete the index
```

`load_data.py`, `cli.py`, and `stopwords.py` accept `--index` to use another index; `cleanup.py` takes the index
name as an argument.

## How it works
- **Index analyzer** `fingerprint_8`: standard tokenizer, lowercase, asciifolding, then `shingle` (8 words, no
  single words). The `body` field uses it with `index_options: offsets`, so every phrase keeps its position in the
  text (see `mappings/index.json`).
- **Search analyzer** `fingerprint_8_search`: the same chain plus the stop filter `boilerplate_stop`, which drops
  boilerplate phrases from queries. The index keeps every phrase.
- **One search per check** (`check.py`): a plain `match` query with the whole input text. The search analyzer turns
  the text into the same phrases on the server. The unified highlighter marks the copied words in the matched
  document, and `_analyze` marks them in the input.
- **Boilerplate** (`boilerplate.py`): find phrases shared by many documents, then apply them as stop words.

### Matching rules
- **any**: at least 1 shared fingerprint. Most sensitive; shared stock phrases will trigger it.
- **min_shared N** (default 3): at least N distinct shared fingerprints. The query uses `minimum_should_match: N`,
  which counts a phrase repeated in the input each time, so the demo then checks the distinct count. N shared
  fingerprints in a row mean a copied run of N + 7 tokens (the standard tokenizer splits hyphenated words, so this
  can be more than N + 7 words).
- **verified_run N** (default 16 words): the input must also contain a copied passage of at least N words in a row,
  that is, an unbroken chain of overlapping shared fingerprints. Two short copies that sit apart in the input do not
  add up.

The query JSON is shown in the interface (expander) and returned by `check()`.

### Phrase length
The phrase length is the `min_shingle_size` and `max_shingle_size` pair in `mappings/index.json` (8 here). Shorter
phrases find shorter and more heavily edited copies but match by chance more often; longer phrases are stronger
evidence but need longer unedited runs. Changing it means recreating the index (`python load_data.py --recreate`).

### Boilerplate as stop words
Disclaimers, signatures, and stock phrases cause many false alarms in leak checks, but they are exactly what
identifies a template or document type. So the index keeps them, and only the search analyzer drops them:
1. Find them: the "Common phrases" tab or `python stopwords.py --find 5`. A sample of documents is read with
   `_mtermvectors`, and one `filters` aggregation counts the candidates exactly.
2. Apply them: "Apply as stop words" or `--apply 5`. This runs `PUT <index>/_settings?reopen=true`, which closes the
   index, updates the `boilerplate_stop` list, and reopens it in one call (also on Serverless). Searches pause while
   the index reopens; on Serverless they can fail for some seconds.
3. Leak checks stay a plain `match`, and stop-word phrases neither find documents nor count as evidence.
4. Classification: "Count boilerplate too" or `--boilerplate` matches with the index analyzer
   (`"analyzer": "fingerprint_8"`), so boilerplate counts again.

`?reopen=true` can only change a filter that already exists: it acknowledges, but ignores, new analysis components.
That is why the filter is defined (with `"_none_"`) when the index is created.

### Guard an LLM (proxy)
`proxy.py` is a small OpenAI-style endpoint (`POST /v1/chat/completions`) that checks the user messages of every
request before it reaches the model (`guard.py`). A prompt that copies protected text gets HTTP 403 with the matched
documents and the copied passages; anything else goes to the LLM through the Elasticsearch inference API, so the
guard and the model share one API key. The whole conversation is checked, because chat clients resend the history.
If the check fails (cluster down, text too long) the request is blocked; set `GUARD_FAIL_OPEN=true` to allow it.

```bash
python proxy.py
curl -s localhost:8787/v1/chat/completions -H 'Content-Type: application/json' \
  -d '{"messages": [{"role": "user", "content": "Write a haiku about search."}]}'
```

Settings in `.env`: `GUARD_RULE` (default `min_shared`), `GUARD_N` (default 3), `GUARD_INFERENCE_ID` (a
`completion` inference endpoint, default `.anthropic-claude-4.5-haiku-completion`), `GUARD_PORT` (8787). This is a
sketch of the enforcement point, not a production gateway: no streaming, no auth, and roles are flattened into one
prompt.

## Troubleshooting
- **`Index 'fingerprint-demo' already exists`**: the loader keeps existing indices. Add `--recreate` to replace it.
- **`Index ... not found`** in the interface or the CLI: run `python load_data.py` first, or check `INDEX_NAME`.
- **`has no 'boilerplate_stop' filter`** when applying stop words: the index was created by an older version of this
  demo. Run `python load_data.py --recreate`.
- **401 or 403 errors**: check `ES_URL` and `ES_API_KEY` in `.env`, and that the key has the privileges in step 2.
- **"The text is too long"**: `_analyze` accepts at most 10,000 tokens, so check up to about 9,000 words at a time.
  Long inputs can also reach the cluster's query clause limit (`indices.query.bool.max_clause_count`), which depends
  on heap size; the demo reports it instead of failing.

## Limits
- Edits break every 8-word phrase that contains them, so heavy paraphrase, summaries, and translations are not
  detected.
- Text shorter than 8 words produces no fingerprints.
- The boilerplate finder samples 500 documents (`sample=`), so very rare shared phrases can be missed.

## Sample data
- Patents: BigPatent, config `a` (Sharma, Li and Wang, "BIGPATENT: A Large-Scale Dataset for Abstractive and
  Coherent Summarization", ACL 2019), licensed CC BY 4.0. Source:
  https://huggingface.co/datasets/NortheasternUniversity/big_patent. Descriptions are cut to 2,000 words.
- Phishing templates (`data/phishing_templates.json`): written for this demo, fictional, no real brands.
- Email corpus (optional, for your own tests): the Enron Email Dataset, William W. Cohen, MLD, Carnegie Mellon
  University, https://www.cs.cmu.edu/~enron/. Not downloaded by this demo.
