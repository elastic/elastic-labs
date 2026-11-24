import React, { Suspense } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import ShellLayout from "./layout/ShellLayout";
import HomePage from "./pages/HomePage";

const AuthApp = React.lazy(() => import("auth/App"));
const DashboardApp = React.lazy(() => import("dashboard/App"));

function RemoteFallback({ label }: { label: string }) {
  return (
    <div className="remote-loading" role="status">
      Loading {label}…
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<ShellLayout />}>
        <Route index element={<HomePage />} />
        <Route
          path="auth/*"
          element={
            <Suspense fallback={<RemoteFallback label="auth" />}>
              <AuthApp />
            </Suspense>
          }
        />
        <Route
          path="dashboard/*"
          element={
            <Suspense fallback={<RemoteFallback label="dashboard" />}>
              <DashboardApp />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}