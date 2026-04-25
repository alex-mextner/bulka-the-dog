import React, { createContext, useState, useEffect } from "react";
import { Language } from "@/lib/translations";
import { trackLanguageChange } from "@/lib/analytics";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
}

export const LanguageContext = createContext<LanguageContextType | undefined>(
  undefined
);

// Initial render value. The site is RU-first — the static snapshot baked
// into dist/spa/index.html (what crawlers and Telegram IV see) ships in
// Russian. Browser auto-detect + localStorage override happen on mount,
// AFTER hydration, to avoid SSR-vs-client mismatch warnings.
const DEFAULT_LANGUAGE: Language = "ru";

function detectClientLanguage(): Language {
  // Defensive: only call from inside useEffect, but double-check anyway.
  if (typeof window === "undefined") return DEFAULT_LANGUAGE;

  // Stored choice wins over browser locale.
  try {
    const stored = window.localStorage.getItem("bulka-language");
    if (stored === "ru" || stored === "rs" || stored === "en") {
      return stored;
    }
  } catch {
    // localStorage may throw under privacy modes / cookieless iframes.
  }

  const browserLang = (navigator.language || "").split("-")[0].toLowerCase();
  if (browserLang === "ru") return "ru";
  if (browserLang === "sr") return "rs";
  if (browserLang === "en") return "en";

  // No clear browser hint — for non-RU/SR/EN locales, fall through to
  // Serbian (this is a Belgrade-based listing).
  return "rs";
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(DEFAULT_LANGUAGE);

  // Resolve the *actual* preferred language only on the client, after mount.
  // If it differs from the default we baked into the SSG snapshot, swap it
  // here — React 18 reconciles this without remounting children.
  useEffect(() => {
    const detected = detectClientLanguage();
    if (detected !== DEFAULT_LANGUAGE) {
      setLanguageState(detected);
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    try {
      window.localStorage.setItem("bulka-language", lang);
    } catch {
      // Same as above — fail silently if storage is unavailable.
    }
    trackLanguageChange(lang);
  };

  useEffect(() => {
    // Set up system theme detection
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleThemeChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    };

    // Set initial theme
    if (mediaQuery.matches) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }

    // Listen for changes
    mediaQuery.addEventListener("change", handleThemeChange);

    return () => {
      mediaQuery.removeEventListener("change", handleThemeChange);
    };
  }, []);

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}
