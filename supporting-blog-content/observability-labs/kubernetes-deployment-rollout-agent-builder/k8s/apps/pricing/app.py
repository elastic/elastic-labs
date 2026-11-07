"""pricing returns a quote. `amount_minor` (integer cents) exists only for USD: the field
orders 1.5.0 depends on."""

import random
import time

from flask import Flask, jsonify, request

app = Flask(__name__)


@app.get("/price")
def price():
    time.sleep(random.uniform(0.010, 0.025))  # simulated lookup
    currency = request.args.get("currency", "USD")
    amount = round(random.uniform(10, 200), 2)
    quote = {"currency": currency, "amount": amount}
    if currency == "USD":
        quote["amount_minor"] = int(round(amount * 100))
    return jsonify(quote)


@app.get("/healthz")
def healthz():
    return "ok"


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, threaded=True)
