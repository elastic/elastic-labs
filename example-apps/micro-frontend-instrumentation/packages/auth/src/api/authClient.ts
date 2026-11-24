import type {
  AuthApiError,
  AuthResult,
  AuthSession,
  LoginRequest,
  RegisterRequest,
} from "@mfe/contracts";

const AUTH_API_URL =
  process.env.AUTH_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";

type ApiSuccess = AuthSession;
type ApiFailure = AuthApiError;

async function postAuth(
  path: string,
  body: LoginRequest | RegisterRequest
): Promise<AuthResult<AuthSession>> {
  let response: Response;
  try {
    response = await fetch(`${AUTH_API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return {
      ok: false,
      error: {
        code: "NETWORK_ERROR",
        message: `Could not reach auth API at ${AUTH_API_URL}.`,
      },
    };
  }

  let payload: ApiSuccess | ApiFailure | null = null;
  try {
    payload = (await response.json()) as ApiSuccess | ApiFailure;
  } catch {
    payload = null;
  }

  if (response.ok && payload && "accessToken" in payload) {
    return { ok: true, data: payload };
  }

  if (payload && "code" in payload && "message" in payload) {
    return { ok: false, error: payload };
  }

  return {
    ok: false,
    error: {
      code: "UNKNOWN_ERROR",
      message: `Request failed (${response.status}).`,
    },
  };
}

export const authClient = {
  login(payload: LoginRequest): Promise<AuthResult<AuthSession>> {
    return postAuth("/auth/login", payload);
  },

  register(payload: RegisterRequest): Promise<AuthResult<AuthSession>> {
    return postAuth("/auth/register", payload);
  },
};

export function persistSession(session: AuthSession): void {
  sessionStorage.setItem("mfe.accessToken", session.accessToken);
  sessionStorage.setItem("mfe.user", JSON.stringify(session.user));
}