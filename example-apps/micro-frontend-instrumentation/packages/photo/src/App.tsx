import React from "react";
import PhotoDetailPage from "./pages/PhotoDetailPage";

/** Federated export — shell mounts this on `/photo/:photoId`. */
export default function App() {
  return (
    <div className="mfe-photo">
      <PhotoDetailPage />
    </div>
  );
}