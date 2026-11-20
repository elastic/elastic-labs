"""Deterministic generator for eye_watch: reports sent to the Eye while the Ring travels.

Every report is assembled from fan-written template sentences, so the text is
original and the dataset is reproducible from the seed alone.
"""

import random

DEFAULT_SEED = 3019
SENTENCES_PER_REPORT = 8

WATCHERS = (
    "orc patrol",
    "Nazgûl",
    "crebain from Dunland",
    "spy from Harad",
    "Uruk scout",
    "warg rider",
    "Easterling captain",
    "palantír of Orthanc",
)

PLACES = (
    "the Shire",
    "Bree",
    "Weathertop",
    "the Misty Mountains",
    "Moria",
    "Lothlórien",
    "the Anduin",
    "the Emyn Muil",
    "the Dead Marshes",
    "Ithilien",
    "Cirith Ungol",
    "Gorgoroth",
)

TEMPLATES = (
    "The {watcher} reported small folk moving east near {place}.",
    "A halfling was seen near {place} carrying something on a chain.",
    "The {watcher} heard talk of a ring in an inn near {place}.",
    "Nothing moved near {place} but crows and wind.",
    "Tracks of hobbit feet were found in the mud near {place}.",
    "A grey wizard was seen riding hard toward {place}.",
    "The {watcher} lost the trail in the rain near {place}.",
    "Elves were singing in the woods near {place}, and the {watcher} turned back.",
    "The ring bearer may have passed {place} two nights ago.",
    "A stranger in a green hood asked about the road to {place}.",
    "Orcs quarrelled over the spoils near {place} and two were killed.",
    "The Eye was told that the ring is moving toward {place}.",
    "A ranger of the North was seen watching the road near {place}.",
    "Smoke rose from a campfire near {place}, but the camp was empty.",
)


def _report_text(rng, watcher):
    picks = rng.sample(TEMPLATES, SENTENCES_PER_REPORT)
    return " ".join(t.format(watcher=watcher, place=rng.choice(PLACES)) for t in picks)


def _ta_date(rng):
    month = rng.randint(1, 12)
    day = rng.randint(1, 28)
    year = 3018 if month >= 4 else 3019
    return f"{year}-{month:02d}-{day:02d}"


def generate_reports(count, seed=DEFAULT_SEED):
    """Yield `count` eye_watch documents as (doc_id, source) pairs."""
    rng = random.Random(seed)
    for number in range(count):
        watcher = rng.choice(WATCHERS)
        source = {
            "watcher": watcher,
            "place": rng.choice(PLACES),
            "ta_date": _ta_date(rng),
            "report": _report_text(rng, watcher),
        }
        yield f"eye-{number:06d}", source
