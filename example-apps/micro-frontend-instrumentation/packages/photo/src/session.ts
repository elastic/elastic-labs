import type { AuthSession } from "@mfe/contracts";

const TOKEN_KEY = "mfe.accessToken";
const USER_KEY = "mfe.user";

export function readSession(): AuthSession | null {
  if (typeof sessionStorage === "undefined") {
    return null;
  }

  const accessToken = sessionStorage.getItem(TOKEN_KEY);
  const userRaw = sessionStorage.getItem(USER_KEY);
  if (!accessToken || !userRaw) {
    return null;
  }

  try {
    const user = JSON.parse(userRaw) as AuthSession["user"];
    if (!user?.id || !user.displayName) {
      return null;
    }
    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email ?? "",
        displayName: user.displayName,
      },
    };
  } catch {
    return null;
  }
}