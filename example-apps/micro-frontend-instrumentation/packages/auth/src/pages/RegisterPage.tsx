import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authClient } from "../api/authClient";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await authClient.register({
      email,
      password,
      displayName,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    navigate("/dashboard");
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
        </label>
        {error ? <p className="auth-error">{error}</p> : null}
        <button type="submit" disabled={submitting}>
          {submitting ? "Creating…" : "Create account"}
        </button>
      </form>
      <p className="auth-footer">
        Already registered? <Link to="../login">Sign in</Link>
      </p>
    </section>
  );
}