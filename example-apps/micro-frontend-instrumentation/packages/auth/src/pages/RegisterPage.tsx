import React, { useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { authClient, persistSession } from "../api/authClient";
import { resolveAfterAuth } from "../returnTo";

export default function RegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const afterAuthPath = resolveAfterAuth(searchParams);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setSubmitting(true);
    const result = await authClient.register({
      email,
      password,
      displayName,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error.message);
      setFieldErrors(result.error.fieldErrors ?? {});
      return;
    }
    persistSession(result.data);
    navigate(afterAuthPath, { replace: true });
  }

  return (
    <section className="auth-card">
      <h1>Create account</h1>
      <p className="auth-lead">Auth microfrontend — registration</p>
      <form onSubmit={onSubmit} className="auth-form">
        <label>
          Display name
          <input
            type="text"
            autoComplete="name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
          />
          {fieldErrors.displayName ? (
            <span className="field-error">{fieldErrors.displayName}</span>
          ) : null}
        </label>
        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          {fieldErrors.email ? (
            <span className="field-error">{fieldErrors.email}</span>
          ) : null}
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
          {fieldErrors.password ? (
            <span className="field-error">{fieldErrors.password}</span>
          ) : null}
        </label>
        {error ? <p className="auth-error">{error}</p> : null}
        <button type="submit" disabled={submitting}>
          {submitting ? "Creating…" : "Create account"}
        </button>
      </form>
      <p className="auth-footer">
        Already registered?{" "}
        <Link to={{ pathname: "../login", search: location.search }}>
          Sign in
        </Link>
      </p>
    </section>
  );
}