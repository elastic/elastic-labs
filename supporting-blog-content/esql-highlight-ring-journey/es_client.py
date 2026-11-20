"""Minimal Elasticsearch HTTP client for the ring-journey dataset (no dependencies).

Connection settings come from environment variables:
  ES_URL      base URL of the cluster (default http://localhost:9200)
  ES_API_KEY  encoded API key (preferred)
  ES_USER     basic-auth user, used only when ES_API_KEY is not set
  ES_PASS     basic-auth password
"""

import base64
import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from functools import lru_cache

DEFAULT_URL = "http://localhost:9200"
REQUEST_TIMEOUT_SECONDS = 600


@dataclass(frozen=True)
class EsResponse:
    status: int
    body: bytes
    warnings: tuple

    def json(self):
        return json.loads(self.body)

    def text(self):
        return self.body.decode("utf-8")


def _auth_header():
    api_key = os.environ.get("ES_API_KEY")
    if api_key:
        return {"Authorization": f"ApiKey {api_key}"}
    user = os.environ.get("ES_USER")
    if not user:
        return {}
    password = os.environ.get("ES_PASS")
    if password is None:
        raise SystemExit("ES_USER is set but ES_PASS is not")
    token = base64.b64encode(f"{user}:{password}".encode()).decode()
    return {"Authorization": f"Basic {token}"}


def _encode(body):
    if isinstance(body, (dict, list)):
        return json.dumps(body).encode("utf-8")
    if isinstance(body, str):
        return body.encode("utf-8")
    return body


def es_request(method, path, body=None, content_type="application/json"):
    """Send one request and return an EsResponse, including error responses."""
    base_url = os.environ.get("ES_URL", DEFAULT_URL).rstrip("/")
    headers = {"Content-Type": content_type, **_auth_header()}
    request = urllib.request.Request(
        base_url + path, data=_encode(body), method=method, headers=headers
    )
    try:
        with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as resp:
            warnings = tuple(resp.headers.get_all("Warning") or ())
            return EsResponse(resp.status, resp.read(), warnings)
    except urllib.error.HTTPError as error:
        warnings = tuple(error.headers.get_all("Warning") or ())
        return EsResponse(error.code, error.read(), warnings)
    except urllib.error.URLError as error:
        message = f"Cannot reach Elasticsearch at {base_url}: {error.reason}"
        raise SystemExit(message) from error


def es_request_ok(method, path, body=None, content_type="application/json"):
    """Like es_request, but exit with the error body on any non-2xx status."""
    response = es_request(method, path, body, content_type)
    if not 200 <= response.status < 300:
        detail = response.text()[:2000]
        raise SystemExit(f"{method} {path} failed with {response.status}: {detail}")
    return response


@lru_cache(maxsize=1)
def is_serverless():
    """True when the cluster is Elastic Cloud Serverless."""
    version = es_request_ok("GET", "/").json().get("version", {})
    return version.get("build_flavor") == "serverless"
