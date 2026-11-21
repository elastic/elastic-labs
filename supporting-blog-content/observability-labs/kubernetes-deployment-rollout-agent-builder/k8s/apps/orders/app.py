"""orders prices each order through the pricing service.

1.4.0 reads the decimal `amount` field. 1.5.0 reads the integer `amount_minor` field to fix a
rounding bug, but pricing only returns `amount_minor` for USD, so EUR and GBP orders fail with a
500 while /healthz keeps answering. EDOT Python is injected by the OpenTelemetry Operator, so the
code has no OpenTelemetry imports: the Flask and requests instrumentations create the spans, and
the logging instrumentation ships the ERROR records.
"""

import logging
import os

import requests
from flask import Flask, jsonify, request

VERSION = os.getenv("APP_VERSION", "1.4.0")
PRICING_URL = os.getenv("PRICING_URL", "http://pricing:8080/price")

app = Flask(__name__)
log = logging.getLogger("orders")


@app.get("/orders")
def create_order():
    currency = request.args.get("currency", "USD")
    quote = requests.get(
        PRICING_URL, params={"currency": currency, "sku": "SKU-1042"}, timeout=2
    ).json()
    if VERSION == "1.4.0":
        total = round(quote["amount"], 2)
    else:
        if "amount_minor" not in quote:
            # Pre-formatted so the log record body is the final message.
            log.error(f"missing field 'amount_minor' currency={currency}")
            return jsonify(error="pricing response missing amount_minor"), 500
        total = quote["amount_minor"] / 100
    return jsonify(currency=currency, total=total, version=VERSION)


@app.get("/healthz")
def healthz():
    return "ok"


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, threaded=True)
