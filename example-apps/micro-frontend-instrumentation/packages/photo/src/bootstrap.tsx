import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import App from "./App";
import "./styles.css";

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <BrowserRouter basename="/photo">
        <Routes>
          <Route path=":photoId" element={<App />} />
        </Routes>
      </BrowserRouter>
    </React.StrictMode>
  );
}