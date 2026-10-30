"""inventory answers GET /stock. EDOT Python is injected by the OpenTelemetry Operator, so the
code has no OpenTelemetry imports: the Flask instrumentation creates the "GET /stock" span.
"""

import random
import time

from flask import Flask, jsonify

app = Flask(__name__)


@app.get("/stock")
def stock():
    # Simulated lookup, about 8 ms of server time.
    time.sleep(random.uniform(0.006, 0.010))
    return jsonify(sku="SKU-1042", available=random.randint(0, 40))


@app.get("/healthz")
def healthz():
    return "ok"


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, threaded=True)
