const DEFAULT_AFTER_AUTH = "/dashboard";

/** Only allow same-app relative paths (open redirect hardening). */
export function sanitizeReturnTo(path: string): string | null {
  const trimmed = path.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return null;
  }
  if (trimmed.includes("://") || trimmed.includes("\\")) {
    return null;
  }
  if (trimmed.startsWith("/auth")) {
    return null;
  }
  return trimmed;
}

export function resolveAfterAuth(searchParams: URLSearchParams): string {
  const raw = searchParams.get("returnTo");
  if (!raw) {
    return DEFAULT_AFTER_AUTH;
  }
  return sanitizeReturnTo(raw) ?? DEFAULT_AFTER_AUTH;
}