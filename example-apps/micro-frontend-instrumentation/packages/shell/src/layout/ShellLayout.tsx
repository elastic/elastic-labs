import React, { useCallback, useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  SESSION_CHANGE_EVENT,
  clearSession,
  isAuthenticated,
} from "../session";

export default function ShellLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [signedIn, setSignedIn] = useState(() => isAuthenticated());

  const syncAuth = useCallback(() => {
    setSignedIn(isAuthenticated());
  }, []);

  useEffect(() => {
    syncAuth();
  }, [location.pathname, syncAuth]);

  useEffect(() => {
    const onSessionChange = () => syncAuth();
    window.addEventListener(SESSION_CHANGE_EVENT, onSessionChange);
    window.addEventListener("storage", onSessionChange);
    window.addEventListener("focus", onSessionChange);
    return () => {
      window.removeEventListener(SESSION_CHANGE_EVENT, onSessionChange);
      window.removeEventListener("storage", onSessionChange);
      window.removeEventListener("focus", onSessionChange);
    };
  }, [syncAuth]);

  function onLogout() {
    clearSession();
    setSignedIn(false);
    navigate("/", { replace: true });
  }

  return (
    <div className="shell">
      <header className="shell-header">
        <div className="shell-brand">
          <Link to="/">Photo gallery</Link>
        </div>
        {signedIn ? (
          <div className="shell-toolbar-actions">
            <button
              type="button"
              className="shell-logout"
              onClick={onLogout}
            >
              Log out
            </button>
          </div>
        ) : null}
      </header>
      <main className="shell-main">
        <Outlet />
      </main>
    </div>
  );
}