"""Checkout service for the DORA metrics lab. Each request calls the payments provider."""

import os
import random

import requests
from flask import Flask, jsonify

app = Flask(__name__)

PAYMENTS_URL = os.getenv("PAYMENTS_URL", "http://payments/")
# Part of every release: a release that raises this value ships a regression.
FAILURE_RATE = float(os.getenv("FAILURE_RATE", "0.0"))


@app.get("/checkout")
def checkout():
    try:
        requests.get(PAYMENTS_URL, timeout=2).raise_for_status()
    except requests.RequestException:
        return jsonify(error="payments provider unavailable"), 502
    if random.random() < FAILURE_RATE:
        return jsonify(error="order validation failed"), 500
    return jsonify(status="ok")


@app.get("/health")
def health():
    return jsonify(status="ok")
