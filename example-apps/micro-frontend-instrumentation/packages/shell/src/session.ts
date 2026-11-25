const TOKEN_KEY = "mfe.accessToken";
const USER_KEY = "mfe.user";

export const SESSION_CHANGE_EVENT = "mfe-session-change";

export function isAuthenticated(): boolean {
  if (typeof sessionStorage === "undefined") {
    return false;
  }
  const token = sessionStorage.getItem(TOKEN_KEY);
  const user = sessionStorage.getItem(USER_KEY);
  return Boolean(token && user);
}

export function clearSession(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  window.dispatchEvent(new Event(SESSION_CHANGE_EVENT));
}