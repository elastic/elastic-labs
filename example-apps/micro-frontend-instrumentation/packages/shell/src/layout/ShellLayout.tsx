import React from "react";
import { Link, Outlet } from "react-router-dom";

export default function ShellLayout() {
  return (
    <div className="shell">
      <header className="shell-header">
        <div className="shell-brand">
          <Link to="/">Photo gallery</Link>
        </div>
        <nav className="shell-nav" aria-label="Main">
          <Link to="/dashboard">Explore</Link>
          <Link to="/auth/login">Sign in</Link>
          <Link to="/auth/register">Register</Link>
        </nav>
      </header>
      <main className="shell-main">
        <Outlet />
      </main>
    </div>
  );
}