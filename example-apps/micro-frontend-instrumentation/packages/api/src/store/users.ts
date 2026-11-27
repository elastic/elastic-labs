import { randomUUID } from "node:crypto";
import type { StoredUser } from "../types";

const usersByEmail = new Map<string, StoredUser>();
const usersById = new Map<string, StoredUser>();

function indexUser(user: StoredUser) {
  usersByEmail.set(user.email.toLowerCase(), user);
  usersById.set(user.id, user);
}

export const userStore = {
  findByEmail(email: string): StoredUser | undefined {
    return usersByEmail.get(email.toLowerCase());
  },

  findById(id: string): StoredUser | undefined {
    return usersById.get(id);
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
    indexUser(user);
    return user;
  },
};