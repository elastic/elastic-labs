import { randomUUID } from "node:crypto";
import type { StoredUser } from "../types";

const usersByEmail = new Map<string, StoredUser>();

export const userStore = {
  findByEmail(email: string): StoredUser | undefined {
    return usersByEmail.get(email.toLowerCase());
  },

  create(input: {
    email: string;
    displayName: string;
    passwordHash: string;
  }): StoredUser {
    const email = input.email.toLowerCase();
    if (usersByEmail.has(email)) {
      throw new Error("EMAIL_EXISTS");
    }
    const user: StoredUser = {
      id: randomUUID(),
      email,
      displayName: input.displayName,
      passwordHash: input.passwordHash,
    };
    usersByEmail.set(email, user);
    return user;
  },
};