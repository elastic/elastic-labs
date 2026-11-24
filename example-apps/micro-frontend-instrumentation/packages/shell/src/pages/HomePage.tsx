import React from "react";
import { Link } from "react-router-dom";

export default function HomePage() {
  return (
    <section className="home">
      <h1>Module Federation shell</h1>
      <p>
        This host loads <strong>auth</strong> and <strong>dashboard</strong> as
        independently deployed remotes. Each remote owns its own routes under{" "}
        <code>/auth/*</code> and <code>/dashboard/*</code>.
      </p>
      <ul className="home-links">
        <li>
          <Link to="/auth/login">Go to login (auth remote)</Link>
        </li>
        <li>
          <Link to="/dashboard">Go to dashboard (dashboard remote)</Link>
        </li>
      </ul>
    </section>
  );
}