import "./global.css";

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

const App = () => (
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

export default App;
