FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages packages/
COPY ui/package.json ui/

RUN npm install

COPY ui ui

WORKDIR /app/ui
ARG VITE_PUBLIC_API_PREFIX=/api
ENV VITE_PUBLIC_API_PREFIX=$VITE_PUBLIC_API_PREFIX
RUN npm run build

FROM nginx:1.27-alpine
COPY ui/nginx-spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/ui/dist /usr/share/nginx/html
EXPOSE 80