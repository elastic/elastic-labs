import React from "react";
import { Route, Routes } from "react-router-dom";
import PhotoGalleryPage from "./pages/PhotoGalleryPage";
import "./styles.css";

/** Federated export — shell mounts this under `/dashboard/*`. */
export default function App() {
  return (
    <div className="mfe-dashboard">
      <Routes>
        <Route index element={<PhotoGalleryPage />} />
        <Route path="*" element={<PhotoGalleryPage />} />
      </Routes>
    </div>
  );
}