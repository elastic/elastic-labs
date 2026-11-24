const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface LoginFields {
  email: string;
  password: string;
}

export interface RegisterFields {
  email: string;
  password: string;
  displayName: string;
}

export function validateLogin(body: unknown):
  | { ok: true; value: LoginFields }
  | { ok: false; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};
  if (!body || typeof body !== "object") {
    return { ok: false, fieldErrors: { _form: "Request body must be a JSON object." } };
  }
  const record = body as Record<string, unknown>;

  const email = typeof record.email === "string" ? record.email.trim() : "";
  const password = typeof record.password === "string" ? record.password : "";

  if (!email) {
    fieldErrors.email = "Email is required.";
  } else if (!EMAIL_PATTERN.test(email)) {
    fieldErrors.email = "Enter a valid email address.";
  }

  if (!password) {
    fieldErrors.password = "Password is required.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return { ok: true, value: { email: email.toLowerCase(), password } };
}

export function validateRegister(body: unknown):
  | { ok: true; value: RegisterFields }
  | { ok: false; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};
  if (!body || typeof body !== "object") {
    return { ok: false, fieldErrors: { _form: "Request body must be a JSON object." } };
  }
  const record = body as Record<string, unknown>;

  const email = typeof record.email === "string" ? record.email.trim() : "";
  const password = typeof record.password === "string" ? record.password : "";
  const displayName =
    typeof record.displayName === "string" ? record.displayName.trim() : "";

  if (!email) {
    fieldErrors.email = "Email is required.";
  } else if (!EMAIL_PATTERN.test(email)) {
    fieldErrors.email = "Enter a valid email address.";
  }

  if (!password) {
    fieldErrors.password = "Password is required.";
  } else if (password.length < 8) {
    fieldErrors.password = "Password must be at least 8 characters.";
  }

  if (!displayName) {
    fieldErrors.displayName = "Display name is required.";
  } else if (displayName.length < 2) {
    fieldErrors.displayName = "Display name must be at least 2 characters.";
  } else if (displayName.length > 64) {
    fieldErrors.displayName = "Display name must be at most 64 characters.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    value: { email: email.toLowerCase(), password, displayName },
  };
}