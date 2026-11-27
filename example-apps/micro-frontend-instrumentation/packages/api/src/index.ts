import { createApp } from "./app";

const port = Number(process.env.PORT ?? 4000);
const jwtSecret = process.env.JWT_SECRET ?? "dev-insecure-change-me";

if (process.env.NODE_ENV === "production" && jwtSecret === "dev-insecure-change-me") {
  console.error("Set JWT_SECRET in production.");
  process.exit(1);
}

const app = createApp({
  jwtSecret,
  corsOrigins: process.env.CORS_ORIGINS,
});

app.listen(port, () => {
  console.log(`@mfe/api listening on http://localhost:${port}`);
});