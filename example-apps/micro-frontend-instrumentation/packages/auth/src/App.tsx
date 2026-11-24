import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";

/** Federated export — shell mounts this under `/auth/*`. */
export default function App() {
  return (
    <div className="mfe-auth">
      <Routes>
        <Route index element={<Navigate to="login" replace />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="*" element={<Navigate to="login" replace />} />
      </Routes>
    </div>
  );
}