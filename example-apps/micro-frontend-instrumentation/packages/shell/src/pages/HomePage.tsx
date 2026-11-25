import React from "react";
import { Link } from "react-router-dom";

export default function HomePage() {
  return (
    <section className="landing">
      <div className="landing-banner">
        <p className="landing-eyebrow">Community photo gallery</p>
        <h1 className="landing-title">
          Browse photos, read the conversation, join in when you&apos;re ready.
        </h1>
        <p className="landing-message">
          Discover what others have shared, open any shot for full detail and
          comments, then sign in to add your voice. Everything runs as
          independent microfrontends behind this shell.
        </p>
        <div className="landing-actions">
          <Link to="/dashboard" className="landing-btn landing-btn-primary">
            Explore
          </Link>
          <Link to="/auth/login" className="landing-btn landing-btn-secondary">
            Sign in
          </Link>
        </div>
      </div>
    </section>
  );
}