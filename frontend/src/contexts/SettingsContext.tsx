import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export interface Settings {
  fontSize: "default" | "large" | "extra-large";
  reduceMotion: boolean;
  highContrast: boolean;
  compactMode: boolean;
}

interface SettingsContextValue {
  settings: Settings;
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

const DEFAULTS: Settings = {
  fontSize: "default",
  reduceMotion: false,
  highContrast: false,
  compactMode: false,
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
  }, [settings]);

  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSetting }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be inside SettingsProvider");
  return ctx;
}
