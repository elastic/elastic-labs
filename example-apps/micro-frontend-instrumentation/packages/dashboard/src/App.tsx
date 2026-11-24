import React from "react";
import { Route, Routes } from "react-router-dom";

function DashboardHome() {
  return (
    <section className="dashboard-panel">
      <h1>Dashboard</h1>
      <p>
        Dashboard microfrontend is running. Replace this view with real widgets
        when you are ready.
      </p>
    </section>
  );
}

/** Federated export — shell mounts this under `/dashboard/*`. */
export default function App() {
  return (
    <div className="mfe-dashboard">
      <Routes>
        <Route index element={<DashboardHome />} />
        <Route path="*" element={<DashboardHome />} />
      </Routes>
    </div>
  );
}