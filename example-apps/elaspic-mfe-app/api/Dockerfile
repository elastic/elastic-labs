FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json* ./
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && npm install --omit=dev \
  && apt-get purge -y g++ make python3 \
  && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
COPY src ./src
ENV API_PORT=3000
EXPOSE 3000
CMD ["node", "src/index.js"]
