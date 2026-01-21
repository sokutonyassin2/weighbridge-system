import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Register service worker for offline functionality
// TEMPORARILY DISABLED SERVICE WORKER TO FIX POST REQUEST ISSUES
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function (registrations) {
    for (let registration of registrations) {
      registration.unregister();
      console.log('Service Worker Unregistered');
    }
  });
}

createRoot(document.getElementById("root")!).render(<App />);
