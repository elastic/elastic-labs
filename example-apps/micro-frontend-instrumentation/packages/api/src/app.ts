import cors from "cors";
import express from "express";
import { createAuthRouter } from "./routes/auth";

function parseCorsOrigins(value: string | undefined): string[] | true {
  if (!value || value === "*") {
    return true;
  }
  return value.split(",").map((origin) => origin.trim()).filter(Boolean);
}

export function createApp(options: {
  jwtSecret: string;
  corsOrigins?: string;
}) {
  const app = express();

  app.use(
    cors({
      origin: parseCorsOrigins(options.corsOrigins),
    })
  );
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/auth", createAuthRouter(options.jwtSecret));

  return app;
}