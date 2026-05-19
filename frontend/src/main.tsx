import { createRoot } from "react-dom/client";
import { AuthProvider } from "./contexts/AuthContext";
import { SettingsProvider } from "./contexts/SettingsContext";
import { TooltipProvider } from "./components/ui/tooltip";
import App from "./App";
import "./styles/index.css";

// Force every refresh to land at the top so users see the Cosello hero
// and primary nav (search / sell) instead of resuming wherever they last
// scrolled. The browser default ("auto") restores previous scroll position;
// "manual" disables that, and the explicit scrollTo handles the first paint.
if ("scrollRestoration" in history) {
  history.scrollRestoration = "manual";
}
window.scrollTo(0, 0);

createRoot(document.getElementById("root")!).render(
  <SettingsProvider>
    <AuthProvider>
      <TooltipProvider delayDuration={300} skipDelayDuration={150}>
        <App />
      </TooltipProvider>
    </AuthProvider>
  </SettingsProvider>
);
