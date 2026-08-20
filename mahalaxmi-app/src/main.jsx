import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Registers sw.js so the app shell/asset caching works and the browser
// treats the site as installable ("Add to Home Screen"/beforeinstallprompt).
// Without this call the service worker file just sits unused on the server.
// Runs after "load" so it doesn't compete with the initial page render for
// bandwidth/CPU.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("Service worker registration failed:", err);
    });
  });
}
