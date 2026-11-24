FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
ARG VITE_PUBLIC_API_PREFIX=/api
ENV VITE_PUBLIC_API_PREFIX=$VITE_PUBLIC_API_PREFIX
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx-spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
