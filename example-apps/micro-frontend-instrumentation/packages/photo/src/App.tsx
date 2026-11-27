import React from "react";
import PhotoDetailPage from "./pages/PhotoDetailPage";
import "./styles.css";

/** Federated export — shell mounts this on `/photo/:photoId`. */
export default function App() {
  return (
    <div className="mfe-photo">
      <PhotoDetailPage />
    </div>
  );
}