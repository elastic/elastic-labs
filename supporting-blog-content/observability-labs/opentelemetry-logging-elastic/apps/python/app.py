import logging

logger = logging.getLogger("checkout")
logger.setLevel(logging.INFO)

logger.info("Order accepted", extra={"app.order.id": "demo-101", "app.amount": 42.5})
logger.warning(
    "Payment retry scheduled", extra={"app.order.id": "demo-102", "app.amount": 18.0}
)
logger.error("Payment rejected", extra={"app.order.id": "demo-103", "app.amount": 72.0})
