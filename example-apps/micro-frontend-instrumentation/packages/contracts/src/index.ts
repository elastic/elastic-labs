/** Credentials for login — wire to your API when ready. */
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
}

/** Shape you can map from your auth API response later. */
export interface AuthSession {
  accessToken: string;
  user: {
    id: string;
    email: string;
    displayName: string;
  };
}

export interface AuthApiError {
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
}

export type AuthResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: AuthApiError };