import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary fullPage>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

// Registers the service worker so build files are cached on the device (less data on repeat visits).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => { void navigator.serviceWorker.register("/sw.js").catch(() => undefined); });
}
