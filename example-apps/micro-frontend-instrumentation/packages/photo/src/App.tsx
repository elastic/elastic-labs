import { MicrofrontendBoundary, TEAM_NAMES } from "@mfe/telemetry";
import React from "react";
import PhotoDetailPage from "./pages/PhotoDetailPage";
import "./styles.css";

/** Federated export — shell mounts this on `/photo/:photoId`. */
export default function App() {
  return (
    <MicrofrontendBoundary teamName={TEAM_NAMES.mediaDetail}>
      <div className="mfe-photo">
        <PhotoDetailPage />
      </div>
    </MicrofrontendBoundary>
  );
}