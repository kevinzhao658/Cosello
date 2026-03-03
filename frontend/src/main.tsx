import { createRoot } from "react-dom/client";
import { AuthProvider } from "./contexts/AuthContext";
import { SettingsProvider } from "./contexts/SettingsContext";
import App from "./App";
import "./styles/index.css";

createRoot(document.getElementById("root")!).render(
  <SettingsProvider>
    <AuthProvider>
      <App />
    </AuthProvider>
  </SettingsProvider>
);
