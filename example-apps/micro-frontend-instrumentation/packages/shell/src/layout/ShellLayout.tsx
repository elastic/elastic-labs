import React from "react";
import { Link, Outlet } from "react-router-dom";

export default function ShellLayout() {
  return (
    <div className="shell">
      <header className="shell-header">
        <div className="shell-brand">
          <Link to="/">MFE Shell</Link>
        </div>
        <nav className="shell-nav">
          <Link to="/auth/login">Sign in</Link>
          <Link to="/auth/register">Register</Link>
          <Link to="/dashboard">Dashboard</Link>
        </nav>
      </header>
      <main className="shell-main">
        <Outlet />
      </main>
    </div>
  );
}