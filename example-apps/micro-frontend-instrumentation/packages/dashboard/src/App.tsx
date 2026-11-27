import { MicrofrontendBoundary, TEAM_NAMES } from "@mfe/telemetry";
import React from "react";
import { Route, Routes } from "react-router-dom";
import PhotoGalleryPage from "./pages/PhotoGalleryPage";
import "./styles.css";

/** Federated export — shell mounts this under `/dashboard/*`. */
export default function App() {
  return (
    <MicrofrontendBoundary teamName={TEAM_NAMES.gallery}>
      <div className="mfe-dashboard">
        <Routes>
          <Route index element={<PhotoGalleryPage />} />
          <Route path="*" element={<PhotoGalleryPage />} />
        </Routes>
      </div>
    </MicrofrontendBoundary>
  );
}