import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { userStore } from "../store/users";
import type { ApiErrorBody, StoredUser } from "../types";

export interface AuthenticatedRequest extends Request {
  authUser?: StoredUser;
}

export function createRequireAuth(jwtSecret: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      const body: ApiErrorBody = {
        code: "UNAUTHORIZED",
        message: "Authentication required.",
      };
      res.status(401).json(body);
      return;
    }

    const token = header.slice("Bearer ".length).trim();
    if (!token) {
      const body: ApiErrorBody = {
        code: "UNAUTHORIZED",
        message: "Authentication required.",
      };
      res.status(401).json(body);
      return;
    }

    let payload: jwt.JwtPayload | string;
    try {
      payload = jwt.verify(token, jwtSecret);
    } catch {
      const body: ApiErrorBody = {
        code: "UNAUTHORIZED",
        message: "Invalid or expired token.",
      };
      res.status(401).json(body);
      return;
    }

    if (typeof payload !== "object" || !payload.sub || typeof payload.sub !== "string") {
      const body: ApiErrorBody = {
        code: "UNAUTHORIZED",
        message: "Invalid or expired token.",
      };
      res.status(401).json(body);
      return;
    }

    const user = userStore.findById(payload.sub);
    if (!user) {
      const body: ApiErrorBody = {
        code: "UNAUTHORIZED",
        message: "Invalid or expired token.",
      };
      res.status(401).json(body);
      return;
    }

    req.authUser = user;
    next();
  };
}