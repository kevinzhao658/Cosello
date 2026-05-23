import { createContext, useContext, useState, useEffect, useMemo, useCallback, type ReactNode } from "react";

export interface Settings {
  fontSize: "default" | "large" | "extra-large";
  reduceMotion: boolean;
  highContrast: boolean;
  compactMode: boolean;
  darkMode: boolean;
  colorBlindMode: "off" | "protanopia" | "deuteranopia" | "tritanopia";
}

interface SettingsContextValue {
  settings: Settings;
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  resetSettings: () => void;
}

const DEFAULTS: Settings = {
  fontSize: "default",
  reduceMotion: false,
  highContrast: false,
  compactMode: false,
  darkMode: false,
  colorBlindMode: "off",
};

const FONT_SIZE_MAP: Record<Settings["fontSize"], string> = {
  default: "16px",
  large: "18px",
  "extra-large": "20px",
};

const STORAGE_KEY = "user_settings";

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return { ...DEFAULTS, ...JSON.parse(saved) };
    } catch {
      // ignore
    }
    return DEFAULTS;
  });

  // Apply effects to the DOM whenever settings change
  useEffect(() => {
    const root = document.documentElement;

    // Font size
    root.style.setProperty("--font-size", FONT_SIZE_MAP[settings.fontSize]);

    // Class toggles
    root.classList.toggle("reduce-motion", settings.reduceMotion);
    root.classList.toggle("high-contrast", settings.highContrast);
    root.classList.toggle("compact-mode", settings.compactMode);

    // Theme + colour-blind integration points. The light-only Brutalist
    // Trade theme has no dark token set yet, and the jade accent is
    // already accessible for most modes — so these attributes are
    // visually inert today and wired purely so the future token blocks
    // can switch on them without a follow-up code change.
    if (settings.darkMode) root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme");

    if (settings.colorBlindMode !== "off") root.setAttribute("data-cb", settings.colorBlindMode);
    else root.removeAttribute("data-cb");
  }, [settings]);

  const updateSetting = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setSettings(DEFAULTS);
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, updateSetting, resetSettings }),
    [settings, updateSetting, resetSettings],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be inside SettingsProvider");
  return ctx;
}
