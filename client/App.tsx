import "./global.css";

import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { StaticRouter } from "react-router-dom/server";
import { LanguageProvider } from "./context/LanguageContext";
import { GalleryProvider, GalleryLightbox } from "@/components/Gallery";
// Vite + React app, NOT Next.js — import the /react entry. /next is Next-only.
import { SpeedInsights } from "@vercel/speed-insights/react";
import { Analytics } from "@vercel/analytics/react";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Vite injects BASE_URL ('/' in dev, '/bulka-the-dog/' on GH Pages).
// React Router wants the basename without the trailing slash.
const basename = import.meta.env.BASE_URL.replace(/\/$/, "");

// SSR: BrowserRouter touches `window.location` during construction, which
// blows up under node-side prerender. Swap to StaticRouter rooted at "/" when
// there's no window — vite-react-ssg only crawls "/" anyway.
const isBrowser = typeof window !== "undefined";

function Router({ children }: { children: React.ReactNode }) {
  if (isBrowser) {
    return <BrowserRouter basename={basename}>{children}</BrowserRouter>;
  }
  return (
    <StaticRouter basename={basename} location="/">
      {children}
    </StaticRouter>
  );
}

const App = () => {
  // Block iOS Safari's native page-level pinch-zoom. Without this, a 2-finger
  // pinch on a photo thumbnail simultaneously zooms the page AND the overlay,
  // and the overlay's initial rect is computed post-zoom so its position is
  // wrong. `gesturestart` + `gesturechange` cover the full gesture lifecycle.
  // More reliable than `maximum-scale=1.0` in the viewport meta, which iOS 17+
  // ignores in some configurations.
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const prevent = (e: Event) => e.preventDefault();
    document.addEventListener("gesturestart", prevent, { passive: false });
    document.addEventListener("gesturechange", prevent, { passive: false });
    return () => {
      document.removeEventListener("gesturestart", prevent);
      document.removeEventListener("gesturechange", prevent);
    };
  }, []);

  // Measure actual safe-area-inset-* values via a probe element and write them
  // to --safe-area-top / --safe-area-bottom CSS custom properties.
  // Reading env() values through a probe gives us the resolved pixel value;
  // this is more reliable than declaring env() directly in a :root CSS custom
  // property on some iOS Safari versions (where the env() value may be stale
  // or 0 inside a CSS var declaration).
  React.useEffect(() => {
    if (typeof document === "undefined") return;

    const measure = () => {
      const p = document.createElement("div");
      p.style.cssText =
        "position:fixed;pointer-events:none;visibility:hidden;";
      document.body.appendChild(p);

      p.style.top = "env(safe-area-inset-top, 0px)";
      const top = parseFloat(getComputedStyle(p).top) || 0;

      p.style.top = "env(safe-area-inset-bottom, 0px)";
      const bottom = parseFloat(getComputedStyle(p).top) || 0;

      document.body.removeChild(p);

      document.documentElement.style.setProperty(
        "--safe-area-top",
        `${top}px`,
      );
      document.documentElement.style.setProperty(
        "--safe-area-bottom",
        `${bottom}px`,
      );
    };

    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <TooltipProvider>
          <GalleryProvider>
            <Toaster />
            <Sonner />
            <Router>
              <Routes>
                <Route path="/" element={<Index />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Router>
            <GalleryLightbox />
            <SpeedInsights />
            <Analytics />
          </GalleryProvider>
        </TooltipProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
};

export default App;
