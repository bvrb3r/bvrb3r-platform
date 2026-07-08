"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

type Theme = "night" | "day";

const ThemeContext = createContext<{ theme: Theme; toggle: () => void; setTheme: (t: Theme) => void }>({
  theme: "night",
  toggle: () => {},
  setTheme: () => {}
});

const STORAGE_KEY = "bvrb3r-theme";

/**
 * Wrap the app (inside AppProviders) with <ThemeProvider>. Night is the default.
 * Applies `data-theme="day"` to <html> when in day mode — the exact hook theme.css uses.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("night");

  useEffect(() => {
    const stored = (typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY)) as Theme | null;
    if (stored === "day" || stored === "night") setThemeState(stored);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "day") root.setAttribute("data-theme", "day");
    else root.removeAttribute("data-theme");
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const toggle = useCallback(() => setThemeState((t) => (t === "day" ? "night" : "day")), []);

  return <ThemeContext.Provider value={{ theme, toggle, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

/**
 * Inline this in <head> (via a <script dangerouslySetInnerHTML>) to prevent a
 * flash of the wrong theme before hydration:
 *
 *   <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
 */
export const NO_FLASH_SCRIPT = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');if(t==='day'){document.documentElement.setAttribute('data-theme','day');}}catch(e){}})();`;
