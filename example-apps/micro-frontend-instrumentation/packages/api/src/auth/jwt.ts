import jwt from "jsonwebtoken";
import type { StoredUser } from "../types";

export function createAccessToken(user: StoredUser, secret: string): string {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
    },
    secret,
    { expiresIn: "1h" }
  );
}