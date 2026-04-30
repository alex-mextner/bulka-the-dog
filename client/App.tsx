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

  // Central viewport measurements for fullscreen mobile layers. CSS viewport
  // units remain the default path; JS only provides resolved values for iOS
  // Safari states where the browser chrome is translucent but the CSS viewport
  // exposed to fixed elements is shorter than the physical screen.
  React.useEffect(() => {
    if (typeof document === "undefined") return;

    const measure = () => {
      const p = document.createElement("div");
      p.style.cssText =
        "position:fixed;pointer-events:none;visibility:hidden;";
      document.body.appendChild(p);

      const readPx = (value: string) => {
        p.style.top = value;
        return parseFloat(getComputedStyle(p).top) || 0;
      };

      const top = Math.max(
        readPx("env(safe-area-inset-top, 0px)"),
        readPx("env(safe-area-max-inset-top, 0px)"),
      );
      const bottom = Math.max(
        readPx("env(safe-area-inset-bottom, 0px)"),
        readPx("env(safe-area-max-inset-bottom, 0px)"),
      );

      document.body.removeChild(p);

      const visualHeight = window.visualViewport?.height ?? window.innerHeight;
      const isAppleTouchDevice =
        /iP(ad|hone|od)/.test(window.navigator.userAgent) ||
        (window.navigator.platform === "MacIntel" &&
          window.navigator.maxTouchPoints > 1);
      const screenHeight = (() => {
        if (!isAppleTouchDevice || !window.screen) return 0;
        const shortSide = Math.min(window.screen.width, window.screen.height);
        const longSide = Math.max(window.screen.width, window.screen.height);
        return window.innerWidth > window.innerHeight ? shortSide : longSide;
      })();
      const viewportHeight = Math.max(
        window.innerHeight,
        visualHeight,
        screenHeight,
      );
      const bottomInset = Math.max(0, viewportHeight - top - visualHeight);

      document.documentElement.style.setProperty(
        "--safe-area-top-js",
        `${top}px`,
      );
      document.documentElement.style.setProperty(
        "--safe-area-bottom-js",
        `${bottom}px`,
      );
      document.documentElement.style.setProperty(
        "--bulka-viewport-height",
        `${viewportHeight}px`,
      );
      document.documentElement.style.setProperty(
        "--bulka-viewport-bottom-inset",
        `${Math.max(bottom, bottomInset)}px`,
      );
    };

    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
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
