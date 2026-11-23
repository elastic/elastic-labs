FROM node:24-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . .
# Serve the prebuilt EDOT Browser bundle from the shop's own origin
RUN cp node_modules/@elastic/opentelemetry-browser/build/elastic-otel-browser.min.js static/
EXPOSE 8080
CMD ["npm", "start"]
