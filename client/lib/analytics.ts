/**
 * Minimal analytics wrapper around Umami Cloud.
 *
 * Why Umami: free tier (100k events/mo), cookieless, no banner required,
 * supports custom event properties so we can dimension every event by the
 * UI language the visitor is using.
 *
 * The provider script is loaded in `index.html`. This module is a thin,
 * SSR-safe facade — calls become no-ops if the script hasn't loaded yet
 * (e.g. ad-blocker, offline, or before hydration).
 */

import type { Language } from "@/lib/translations";

type EventProps = Record<string, string | number | boolean>;

// Umami exposes a global `umami` object once the script boots.
declare global {
  interface Window {
    umami?: {
      track: (
        eventName?: string | ((props: Record<string, unknown>) => Record<string, unknown>),
        eventData?: EventProps
      ) => void;
    };
  }
}

const STORAGE_KEY = "bulka-language";

/**
 * Read the current UI language without depending on React context, so we can
 * stamp it onto every event regardless of where it's fired from.
 */
function readCurrentLanguage(): Language | "unknown" {
  if (typeof window === "undefined") return "unknown";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "ru" || stored === "rs" || stored === "en") return stored;
  } catch {
    // localStorage may throw in private mode / SSR — fall through.
  }
  return "unknown";
}

function isAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.umami?.track === "function";
}

/**
 * Track a named event. Always attaches the current UI language so reports
 * can be sliced by `language` in the Umami dashboard.
 */
export function trackEvent(name: string, props?: EventProps): void {
  if (!isAvailable()) return;
  const payload: EventProps = {
    language: readCurrentLanguage(),
    ...(props ?? {}),
  };
  try {
    window.umami!.track(name, payload);
  } catch {
    // Never let analytics crash the app.
  }
}

/**
 * Track a UI language change. Called from LanguageContext.setLanguage.
 */
export function trackLanguageChange(lang: Language): void {
  if (!isAvailable()) return;
  try {
    window.umami!.track("language_change", { language: lang });
  } catch {
    // swallow
  }
}

/**
 * Manually record a page view. Umami auto-tracks the initial page view and
 * (with default config) navigations, so this is only needed for SPA routing
 * that doesn't change the URL via the History API. Exposed for completeness.
 */
export function trackPageView(url?: string): void {
  if (!isAvailable()) return;
  try {
    window.umami!.track((props) => ({
      ...props,
      url: url ?? props.url,
      language: readCurrentLanguage(),
    }));
  } catch {
    // swallow
  }
}
