import { MicrofrontendBoundary, TEAM_NAMES } from "@mfe/telemetry";
import React, { Suspense } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import ShellLayout from "./layout/ShellLayout";
import HomePage from "./pages/HomePage";

const AuthApp = React.lazy(() => import("auth/App"));
const DashboardApp = React.lazy(() => import("dashboard/App"));
const PhotoApp = React.lazy(() => import("photo/App"));

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
      <Route
        element={
          <MicrofrontendBoundary teamName={TEAM_NAMES.platformShell}>
            <ShellLayout />
          </MicrofrontendBoundary>
        }
      >
        <Route index element={<HomePage />} />
        <Route
          path="auth/*"
          element={
            <MicrofrontendBoundary teamName={TEAM_NAMES.identity}>
              <Suspense fallback={<RemoteFallback label="auth" />}>
                <AuthApp />
              </Suspense>
            </MicrofrontendBoundary>
          }
        />
        <Route
          path="dashboard/*"
          element={
            <MicrofrontendBoundary teamName={TEAM_NAMES.gallery}>
              <Suspense fallback={<RemoteFallback label="dashboard" />}>
                <DashboardApp />
              </Suspense>
            </MicrofrontendBoundary>
          }
        />
        <Route
          path="photo/:photoId"
          element={
            <MicrofrontendBoundary teamName={TEAM_NAMES.mediaDetail}>
              <Suspense fallback={<RemoteFallback label="photo" />}>
                <PhotoApp />
              </Suspense>
            </MicrofrontendBoundary>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}