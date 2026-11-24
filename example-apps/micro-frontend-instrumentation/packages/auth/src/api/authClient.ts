import type {
  AuthResult,
  AuthSession,
  LoginRequest,
  RegisterRequest,
} from "@mfe/contracts";

/**
 * Replace method bodies with `fetch` to your auth API.
 * Contracts in `@mfe/contracts` define the expected shapes.
 */
export const authClient = {
  async login(_payload: LoginRequest): Promise<AuthResult<AuthSession>> {
    return {
      ok: false,
      error: {
        code: "NOT_IMPLEMENTED",
        message:
          "Wire authClient.login() to your API (see packages/auth/src/api/authClient.ts).",
      },
    };
  },

  async register(_payload: RegisterRequest): Promise<AuthResult<AuthSession>> {
    return {
      ok: false,
      error: {
        code: "NOT_IMPLEMENTED",
        message:
          "Wire authClient.register() to your API (see packages/auth/src/api/authClient.ts).",
      },
    };
  },
};