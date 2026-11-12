FROM node:22-slim
WORKDIR /app
RUN npm init -y > /dev/null && npm install --no-fund --no-audit @elastic/opentelemetry-node@1.19.0 pino@9
COPY app.cjs .
ENV ELASTIC_OTEL_NODE_ENABLE_LOG_SENDING=true
CMD ["node", "--import", "@elastic/opentelemetry-node", "app.cjs"]
