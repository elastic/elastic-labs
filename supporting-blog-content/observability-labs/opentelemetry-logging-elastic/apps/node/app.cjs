// app.cjs
const logger = require("pino")();

logger.info({ "app.order.id": "demo-101", "app.amount": 42.5 }, "Order accepted");
logger.warn({ "app.order.id": "demo-102", "app.amount": 18.0 }, "Payment retry scheduled");
logger.error({ "app.order.id": "demo-103", "app.amount": 72.0 }, "Payment rejected");
