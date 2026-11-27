import bcrypt from "bcryptjs";
import { Router, type Request, type Response } from "express";
import { createAccessToken } from "../auth/jwt";
import { userStore } from "../store/users";
import type { ApiErrorBody, AuthSuccessBody } from "../types";
import { validateLogin, validateRegister } from "../validation";

const SALT_ROUNDS = 10;

function validationError(fieldErrors: Record<string, string>, res: Response) {
  const body: ApiErrorBody = {
    code: "VALIDATION_ERROR",
    message: "One or more fields are invalid.",
    fieldErrors,
  };
  res.status(400).json(body);
}

function toPublicUser(user: { id: string; email: string; displayName: string }) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
  };
}

export function createAuthRouter(jwtSecret: string): Router {
  const router = Router();

  router.post("/login", async (req: Request, res: Response) => {
    const parsed = validateLogin(req.body);
    if (!parsed.ok) {
      validationError(parsed.fieldErrors, res);
      return;
    }

    const user = userStore.findByEmail(parsed.value.email);
    if (!user) {
      const body: ApiErrorBody = {
        code: "INVALID_CREDENTIALS",
        message: "Invalid email or password.",
      };
      res.status(401).json(body);
      return;
    }

    const matches = await bcrypt.compare(parsed.value.password, user.passwordHash);
    if (!matches) {
      const body: ApiErrorBody = {
        code: "INVALID_CREDENTIALS",
        message: "Invalid email or password.",
      };
      res.status(401).json(body);
      return;
    }

    const body: AuthSuccessBody = {
      accessToken: createAccessToken(user, jwtSecret),
      user: toPublicUser(user),
    };
    res.status(200).json(body);
  });

  router.post("/register", async (req: Request, res: Response) => {
    const parsed = validateRegister(req.body);
    if (!parsed.ok) {
      validationError(parsed.fieldErrors, res);
      return;
    }

    if (userStore.findByEmail(parsed.value.email)) {
      const body: ApiErrorBody = {
        code: "EMAIL_ALREADY_EXISTS",
        message: "An account with this email already exists.",
        fieldErrors: { email: "This email is already registered." },
      };
      res.status(409).json(body);
      return;
    }

    const passwordHash = await bcrypt.hash(parsed.value.password, SALT_ROUNDS);

    let user;
    try {
      user = userStore.create({
        email: parsed.value.email,
        displayName: parsed.value.displayName,
        passwordHash,
      });
    } catch (err) {
      if (err instanceof Error && err.message === "EMAIL_EXISTS") {
        const body: ApiErrorBody = {
          code: "EMAIL_ALREADY_EXISTS",
          message: "An account with this email already exists.",
          fieldErrors: { email: "This email is already registered." },
        };
        res.status(409).json(body);
        return;
      }
      throw err;
    }

    const body: AuthSuccessBody = {
      accessToken: createAccessToken(user, jwtSecret),
      user: toPublicUser(user),
    };
    res.status(201).json(body);
  });

  return router;
}