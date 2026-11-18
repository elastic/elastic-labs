"""Streamlit AppTest smoke tests against a real cluster (no mocks): the app renders, checks text and handles
short input and a missing index. Uses a throwaway index and deletes it afterwards. Run: pytest tests -q
"""

import secrets
import sys
from pathlib import Path

import pytest
from streamlit.testing.v1 import AppTest

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))

import es as es_module  # noqa: E402
from es import create_index, get_client  # noqa: E402

COPIED = (
    "the sensor assembly comprises a flexible substrate carrying a plurality of electrodes arranged in a "
    "regular grid pattern wherein each electrode is coupled to a shared readout line through a switch"
)
FILLER = " ".join(
    f"Section {i} describes part number {i * 7} of the pump housing." for i in range(40)
)
BODY = f"{FILLER} {COPIED}. The end of the filing."  # > 150 words, so the example buttons quote from it


@pytest.fixture(scope="module")
def index():
    es, name = get_client(), f"fingerprint-demo-test-{secrets.token_hex(4)}"
    create_index(es, name)
    es.index(
        index=name,
        id="1",
        document={
            "title": "Patent 1",
            "source": "test",
            "collection": "patents",
            "body": BODY,
        },
        refresh=True,
    )
    yield name
    es.indices.delete(index=name, ignore_unavailable=True)


def run_app(monkeypatch, name, text=None):
    monkeypatch.setattr(es_module, "index_name", lambda: name)
    at = AppTest.from_file(str(HERE / "app.py"), default_timeout=60)
    at.run()
    if text is not None:
        at.text_area(key="text").set_value(text).run()
    return at


def test_app_check_flow(monkeypatch, index):
    at = run_app(monkeypatch, index, f"Hi team, from the filing: {COPIED} Thanks")
    assert not at.exception
    assert at.subheader[0].value == "1 protected document(s) matched"
    assert any("Longest copied run" == m.label for m in at.metric)


def test_app_short_input(monkeypatch, index):
    at = run_app(monkeypatch, index, "hello world")
    assert not at.exception
    assert "at least 8 words" in at.info[0].value


def test_app_example_buttons(monkeypatch, index):
    at = run_app(monkeypatch, index)
    at.button[0].click().run()  # "Email quoting a document"
    assert not at.exception
    assert at.subheader[0].value == "1 protected document(s) matched"


def test_app_missing_index(monkeypatch):
    at = run_app(monkeypatch, f"fingerprint-demo-missing-{secrets.token_hex(4)}")
    assert not at.exception
    assert "not found" in at.error[0].value
