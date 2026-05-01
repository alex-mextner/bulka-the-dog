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
  // Central viewport measurements for fullscreen mobile layers. CSS viewport
  // units remain the default path; JS only provides resolved values for iOS
  // Safari states where the browser chrome is translucent but the CSS viewport
  // exposed to fixed elements is shorter than the physical screen.
  React.useEffect(() => {
    if (typeof document === "undefined") return;

    const lastValues = new Map<string, number>();
    const setPxVar = (name: string, value: number, threshold = 0.5) => {
      const rounded = Math.round(value);
      const prev = lastValues.get(name);
      if (prev != null && Math.abs(prev - rounded) < threshold) return;
      lastValues.set(name, rounded);
      document.documentElement.style.setProperty(name, `${rounded}px`);
    };

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

      const isAppleTouchDevice =
        /iP(ad|hone|od)/.test(window.navigator.userAgent) ||
        (window.navigator.platform === "MacIntel" &&
          window.navigator.maxTouchPoints > 1);
      if (isAppleTouchDevice) {
        document.documentElement.dataset.appleTouch = "true";
      } else {
        delete document.documentElement.dataset.appleTouch;
      }

      const visualHeight = window.visualViewport?.height ?? window.innerHeight;
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
      const visualBottomOffset = window.visualViewport
        ? Math.max(
            0,
            window.innerHeight -
              window.visualViewport.offsetTop -
              window.visualViewport.height,
          )
        : 0;

      setPxVar("--safe-area-top-js", top);
      setPxVar("--safe-area-bottom-js", bottom);
      setPxVar("--bulka-viewport-height", viewportHeight);
      setPxVar("--bulka-viewport-bottom-inset", Math.max(bottom, bottomInset));
      setPxVar(
        "--bulka-mobile-fixed-bottom-offset",
        Math.min(96, visualBottomOffset),
        8,
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
