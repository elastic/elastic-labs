# ES|QL HIGHLIGHT: the Ring's journey

Data and queries for the Elastic Labs post on the ES|QL `HIGHLIGHT` command. The post follows the One Ring
from the Shire to Mount Doom, and each stop on the way shows one thing about highlighting search results in
ES|QL: multivalued fields, wildcards, per-index analyzers, computed columns, fuzzy matching, stemming that
backfires, and what the query planner does to keep highlighting cheap.

It works on Elasticsearch 9.6 or later (self-managed or Elastic Cloud Hosted) and on Elastic Cloud Serverless.

All records are fan-written for this post. They follow events from *The Lord of the Rings* in our own words and
quote no text from the books.

## What you get

| Index | Docs | Used at | Notes |
|---|---|---|---|
| `fellowship_log` | 28 | every stop | `text` uses the `english` analyzer, `text.exact` uses `standard`; `who` is multivalued |
| `red_book` | 4 | Rivendell | Bilbo's drafts; `text` uses `standard` |
| `book_of_mazarbul` | 7 | Moria | one keyword field, `entry`, shaped like `date \| scribe \| note` for DISSECT |
| `eye_watch` | 50,000 | Mordor | generated reports, seeded so every run builds the same data |

## Quickstart

### 1. Get an Elasticsearch endpoint

- **Elastic Cloud:** start a [free trial](https://cloud.elastic.co/registration?utm_source=github&utm_content=elasticsearch-labs-samples)
  and create a Serverless Elasticsearch project, or a hosted deployment on 9.6 or later.
- **On your laptop:** with Docker installed, run `curl -fsSL https://elastic.co/start-local | sh`. It starts
  Elasticsearch and Kibana on `http://localhost:9200` and `http://localhost:5601` and creates an API key for you.

### 2. Load the data

**Option A: Kibana Dev Tools (no install).** Open Kibana, go to **Dev Tools > Console**, paste the contents of
[`kibana-dev-tools-setup.txt`](kibana-dev-tools-setup.txt), select everything, and run it. This creates
`fellowship_log`, `red_book` and `book_of_mazarbul`, which cover every stop except Mordor.

**Option B: Python (all four indices, including `eye_watch` for Mordor).** Python 3.9 or later, with no packages
to install:

```bash
export ES_URL="https://<your-elasticsearch-endpoint>"
export ES_API_KEY="<your-encoded-api-key>"
python3 load.py
```

It prints one line per index and ends with `refreshed and force-merged` (on Serverless, `refreshed`). Loading
`eye_watch` takes under a minute on most clusters; pass `--eye-watch-count 10000` for a smaller set.

`load.py` deletes and recreates the four indices every time it runs. On self-managed and hosted clusters it gives
`eye_watch` three primary shards and no replicas, so the query profile in the Mordor section has several shards to
show. It's disposable demo data; delete the index when you're done. Serverless manages shards itself, so the script
leaves those settings out there.

Authentication: set `ES_API_KEY` (preferred), or `ES_USER` and `ES_PASS` for basic authentication. With neither
set, the scripts send no credentials, which only works on a local cluster with security turned off.

### 3. Run the queries

[`queries.esql`](queries.esql) holds every query from the post in reading order, each under a `// name:` line.
Paste any of them into **Discover** (ES|QL mode). In the Dev Tools Console, wrap a query in a `POST /_query` request
with the query in triple quotes (`{ "query": """FROM ...""" }`). Or run them from the command line:

```bash
python3 run_queries.py                    # every query
python3 run_queries.py amon_hen_ringing   # one query by name
```

Each result is printed as a table, with any warnings Elasticsearch returns.

### 4. Reproduce the Mordor numbers

```bash
python3 profile_mordor.py
```

It runs four variants of the same `eye_watch` search (no `HIGHLIGHT`; `HIGHLIGHT` before `SORT` and `LIMIT`;
an `EVAL MV_FIRST(highlight_report)` between `HIGHLIGHT` and `SORT`; and that `EVAL` moved after `LIMIT`). For
each one it prints the median `took` over five runs and, from a profiled run, how many rows reached the TopN and
Highlight operators.

The row counts are the point: with the top-N pushed below `HIGHLIGHT`, the Highlight operator sees 3 rows; with
the `EVAL` in between, it sees every matching report. Absolute times depend on your hardware.

## The stops

| Stop | Queries | What it shows |
|---|---|---|
| Bag End | `bag_end_first`, `bag_end_fire` | A first `HIGHLIGHT`, and custom `pre_tags` and `post_tags` |
| Bree | `bree_multivalued`, `bree_phrase_*`, `bree_mr_*` | Each value of a multivalued field is highlighted on its own, and phrases don't cross values |
| Weathertop | `weathertop_kql` | A KQL wildcard, `nazg*`, marks `Nazgûl` |
| Rivendell | `rivendell_two_archives` | Each row uses the analyzer of the index it came from |
| Moria | `moria_dissect_standard`, `moria_to_text_english` | Highlighting a DISSECT column, and giving it an analyzer with `TO_TEXT` |
| Lothlórien | `lothlorien_*` | Fuzzy matching finds `Lothlórien`, and shows why `Barad-dur` also matched `During` |
| Amon Hen | `amon_hen_*` | The english stemmer turns *ringing* into *ring*, and `text.exact` fixes it |
| Mordor | `mordor_*`, `profile_mordor.py` | How many rows `HIGHLIGHT` actually processes |
| Mount Doom | `mount_doom_results_page` | A complete search results page in one query |

## Files

| File | Purpose |
|---|---|
| `kibana-dev-tools-setup.txt` | Dev Tools requests that create and fill the three hand-written indices |
| `mappings/`, `data/` | The same mappings and records, used by `load.py` |
| `load.py` | Creates all four indices and loads the data |
| `generate_eye_watch.py` | Builds the `eye_watch` reports from template sentences and a fixed seed |
| `queries.esql` | Every query from the post |
| `search-comparison.txt` | The two `_search` highlight requests the post compares with `HIGHLIGHT` (Dev Tools) |
| `run_queries.py` | Runs the queries and prints the results |
| `profile_mordor.py` | Times and profiles the Mordor variants |
| `es_client.py` | Small HTTP client shared by the scripts, using only the Python standard library |
