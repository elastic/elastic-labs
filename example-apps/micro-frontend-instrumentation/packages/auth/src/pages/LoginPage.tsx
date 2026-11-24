import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authClient } from "../api/authClient";

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await authClient.login({ email, password });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    navigate("/dashboard");
  }

  return (
    <section className="auth-card">
      <h1>Sign in</h1>
      <p className="auth-lead">Auth microfrontend — login</p>
      <form onSubmit={onSubmit} className="auth-form">
        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error ? <p className="auth-error">{error}</p> : null}
        <button type="submit" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="auth-footer">
        No account? <Link to="../register">Create one</Link>
      </p>
    </section>
  );
}