import { MicrofrontendBoundary, TEAM_NAMES } from "@mfe/telemetry";
import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import "./styles.css";

/** Federated export — shell mounts this under `/auth/*`. */
export default function App() {
  return (
    <MicrofrontendBoundary teamName={TEAM_NAMES.identity}>
      <div className="mfe-auth">
        <Routes>
          <Route index element={<Navigate to="login" replace />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route path="*" element={<Navigate to="login" replace />} />
        </Routes>
      </div>
    </MicrofrontendBoundary>
  );
}