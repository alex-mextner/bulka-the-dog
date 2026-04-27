import { useState, useEffect, useRef } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { Language } from "@/lib/translations";
import { Menu, X, Globe, Heart, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { id: "appearance", key: "nav.appearance" },
  { id: "habits", key: "nav.habits" },
  { id: "skills", key: "nav.skills" },
  { id: "health", key: "nav.health" },
  { id: "conditions", key: "nav.conditions" },
  { id: "faq", key: "nav.faq" },
  { id: "contact", key: "nav.contact" },
  { id: "gallery", key: "nav.gallery" },
];

const languages: { code: Language; short: string }[] = [
  { code: "ru", short: "RU" },
  { code: "rs", short: "SR" },
  { code: "en", short: "EN" },
];

export function Header() {
  const { language, setLanguage, t } = useLanguage();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("");
  // Past ~80px we collapse the lang switcher into a dropdown (both mobile
  // and desktop) and surface the current section name on mobile. Same
  // threshold the active-section tracker uses to suppress the "no section
  // yet" state at the top.
  const [isScrolled, setIsScrolled] = useState(false);
  // Collapsed lang dropdown open/closed (rendered when isScrolled).
  const [isLangOpen, setIsLangOpen] = useState(false);
  const langWrapRef = useRef<HTMLDivElement | null>(null);
  // The hero CTA is "primary" and bright. When it scrolls out of view we
  // surface a compact sticky CTA in the header so the action is always
  // reachable without rolling back to top.
  const [showStickyCta, setShowStickyCta] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const sections = navItems.map((item) => item.id);
      let current = "";
      for (const section of sections) {
        const element = document.getElementById(section);
        if (element) {
          const rect = element.getBoundingClientRect();
          if (rect.top <= 120) current = section;
        }
      }
      if (window.scrollY < 80) current = "";
      setActiveSection(current);
      setIsScrolled(window.scrollY > 80);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close the collapsed lang dropdown on outside click + Escape.
  useEffect(() => {
    if (!isLangOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (
        langWrapRef.current &&
        !langWrapRef.current.contains(e.target as Node)
      ) {
        setIsLangOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsLangOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [isLangOpen]);

  // Auto-close the lang dropdown when we scroll back to the top — the
  // collapsed trigger is unmounted and the flat 3-button group reappears.
  useEffect(() => {
    if (!isScrolled) setIsLangOpen(false);
  }, [isScrolled]);

  // Track visibility of the hero CTA to drive the sticky-in-header CTA.
  useEffect(() => {
    const el = document.getElementById("hero-cta");
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setShowStickyCta(!entry.isIntersecting),
      { rootMargin: "-80px 0px 0px 0px", threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scrollToTop = () => {
    setIsMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleNavClick = (id: string) => {
    const element = document.getElementById(id);
    if (!element) return;
    setIsMenuOpen(false);
    const headerHeight = 72;

    // First-pass target estimate. May be wrong if lazy-loaded images
    // below the fold expand the page mid-flight — that's why phase 2
    // re-measures.
    const initialTarget =
      element.getBoundingClientRect().top + window.scrollY - headerHeight;
    const currentY = window.scrollY;
    const distance = initialTarget - currentY;
    if (Math.abs(distance) < 4) return;

    // Decel zone = last 30% of the trip, capped at 600px so very long
    // jumps still ease in over a sane distance.
    const decelZone = Math.min(Math.abs(distance) * 0.3, 600);
    const sign = Math.sign(distance);
    const jumpTo = initialTarget - sign * decelZone;

    // Phase 1: instant jump to (target − decelZone). The 'instant' value
    // is a standard ScrollBehavior — overrides any CSS
    // scroll-behavior:smooth that the html element might be inheriting.
    window.scrollTo({ top: jumpTo, left: 0, behavior: "instant" });

    // Phase 2: re-measure the target on the next frame. Lazy-loaded
    // images that came into the viewport during phase 1 may have
    // expanded the page, shifting the section's true position.
    requestAnimationFrame(() => {
      const settledTarget =
        element.getBoundingClientRect().top + window.scrollY - headerHeight;
      window.scrollTo({ top: settledTarget, behavior: "smooth" });
    });

    // Phase 3: settle-correction loop. Some lazy-loaded images (those
    // BELOW our scroll target initially) only start decoding after we
    // arrive at the target, then expand the page and push our section
    // away. We can't predict this from phase 2 alone — rAF runs ~16ms
    // after phase 1 jump, but image decode lands ~50–500ms later. So
    // every 250ms for ~1.5s, check the section's current viewport-
    // relative top and nudge if it's drifted >30px from the header
    // offset. Stops as soon as the section is parked correctly. Cheap
    // (a few rect reads), bounded (6 iterations max).
    let iterations = 0;
    const settle = () => {
      iterations++;
      const currentTop = element.getBoundingClientRect().top;
      const drift = currentTop - headerHeight;
      if (Math.abs(drift) > 30) {
        window.scrollTo({
          top: window.scrollY + drift,
          behavior: "smooth",
        });
      }
      if (iterations < 6) {
        window.setTimeout(settle, 250);
      }
    };
    window.setTimeout(settle, 800);
  };

  // Hidden on mobile (header is too tight) — shows from `sm:` (640px) up,
  // and only when the hero CTA is out of view. When hidden, collapses to
  // zero width via max-width + padding transition so the inline nav can
  // claim that space instead of being clipped.
  const stickyCtaClasses = cn(
    "hidden sm:inline-flex items-center bg-primary text-primary-foreground rounded-full font-semibold text-sm shadow-lg shadow-primary/30 hover:bg-primary/90 hover:shadow-primary/40 overflow-hidden whitespace-nowrap",
    "transition-[max-width,padding,opacity,transform] duration-300 ease-out will-change-[max-width,padding,opacity,transform] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30",
    showStickyCta
      ? "opacity-100 translate-x-0 pointer-events-auto max-w-[14rem] px-3.5 py-2 gap-1.5"
      : "opacity-0 translate-x-3 pointer-events-none max-w-0 px-0 py-0 gap-0",
  );

  // Fade/slide states for the morph. On <nav: when burger is open, the
  // default content (logo + lang + sticky CTA) translates out & fades, and
  // a horizontal nav-scroll layer takes its place. The burger itself stays
  // anchored to the right and never animates away.
  // `left-4` mirrors the parent's `px-4` so the logo doesn't kiss the edge
  // on mobile; `right-14` reserves room for the absolute burger.
  const defaultLayerCls = cn(
    "absolute inset-y-0 left-4 right-14 flex items-center gap-3 transition-all duration-300 ease-out",
    isMenuOpen
      ? "opacity-0 -translate-x-3 pointer-events-none nav:opacity-100 nav:translate-x-0 nav:pointer-events-auto"
      : "opacity-100 translate-x-0",
  );
  // morphedNav extends to right-0 (NOT right-14 like the default layer) so
  // chips can scroll UNDER the gradient overlay AND the burger button. If we
  // stopped at right-14 the chips would be hard-clipped 56px before the right
  // edge and the gradient would have nothing left to fade — there'd be a
  // solid background-coloured stripe between the last chip and the X. Burger
  // stays clickable on top via z-10 + the gradient overlay between them
  // (z-9, pointer-events-none) hides the chips visually behind the X.
  const morphedNavCls = cn(
    "absolute inset-y-0 left-4 right-0 flex items-center transition-all duration-300 ease-out nav:hidden",
    isMenuOpen
      ? "opacity-100 translate-x-0 pointer-events-auto"
      : "opacity-0 translate-x-3 pointer-events-none",
  );

  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:bg-primary focus:text-primary-foreground focus:px-3 focus:py-2 focus:rounded-md focus:z-50"
      >
        Перейти к содержимому
      </a>
      <div className="max-w-6xl mx-auto py-4 relative h-[60px] md:h-[64px]">
        {/* Default layer: logo + (desktop) inline nav + sticky CTA + lang */}
        <div className={defaultLayerCls}>
          <button
            onClick={scrollToTop}
            className="text-2xl font-bold text-primary hover:text-primary/80 transition-colors shrink-0"
            aria-label={`${t("brand.name")} — top`}
          >
            🐾 {t("brand.name")}
          </button>

          {/* Current section chip (mobile/tablet only, when scrolled past
              the top and the morphed nav isn't open). Tapping it opens
              the morphed full-nav strip — same as the burger. */}
          {activeSection && isScrolled && !isMenuOpen && (
            <button
              type="button"
              onClick={() => setIsMenuOpen(true)}
              aria-haspopup="true"
              aria-expanded={isMenuOpen}
              aria-controls="mobile-nav"
              className="nav:hidden min-w-0 truncate px-3 py-1.5 rounded-full text-sm font-medium bg-secondary/60 text-foreground/85 hover:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {t("nav." + activeSection)}
            </button>
          )}

          <nav
            aria-label="Разделы страницы"
            className="hidden nav:flex items-center gap-0.5 ml-2 min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {navItems.map((item) => {
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  aria-current={isActive ? "location" : undefined}
                  className={cn(
                    "shrink-0 px-2.5 py-2 rounded-lg font-medium whitespace-nowrap text-sm transition-colors text-foreground/80 hover:text-foreground hover:bg-secondary/60",
                    isActive &&
                      "text-foreground bg-secondary/40 ring-1 ring-border/50",
                  )}
                >
                  {t(item.key)}
                </button>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleNavClick("contact")}
              aria-label={t("cta.adopt_aria")}
              aria-hidden={!showStickyCta}
              tabIndex={showStickyCta ? 0 : -1}
              className={stickyCtaClasses}
            >
              <Heart size={16} aria-hidden="true" />
              {t("cta.sticky")}
            </button>

            {/* Language Switcher — flat 3-button group.
                Visible only at the top of the page (both mobile and desktop);
                collapses into the dropdown below once scrolled. */}
            <div
              role="group"
              aria-label="Сменить язык"
              className={cn(
                "items-center gap-1 px-1.5 py-1 rounded-full bg-primary/5 border border-primary/20",
                isScrolled ? "hidden" : "flex",
              )}
            >
              <Globe
                size={16}
                aria-hidden="true"
                className="text-primary mx-1"
              />
              {languages.map((lang) => {
                const isCurrent = language === lang.code;
                return (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => setLanguage(lang.code)}
                    aria-pressed={isCurrent}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                      isCurrent
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-primary hover:bg-primary/10",
                    )}
                  >
                    {lang.short}
                  </button>
                );
              })}
            </div>

            {/* Collapsed lang dropdown — shown whenever scrolled (mobile + desktop).
                Shows current code + chevron, expands a vertical menu. */}
            {isScrolled && (
              <div
                ref={langWrapRef}
                className="relative"
              >
                <button
                  type="button"
                  onClick={() => setIsLangOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={isLangOpen}
                  aria-label="Сменить язык"
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-primary/5 border border-primary/20 text-primary text-xs font-semibold hover:bg-primary/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <Globe size={14} aria-hidden="true" />
                  {languages.find((l) => l.code === language)?.short ?? "RU"}
                  <ChevronDown
                    size={14}
                    aria-hidden="true"
                    className={cn(
                      "transition-transform",
                      isLangOpen && "rotate-180",
                    )}
                  />
                </button>
                {isLangOpen && (
                  <div
                    role="menu"
                    aria-label="Сменить язык"
                    className="absolute right-0 top-full mt-1 z-20 min-w-[5rem] rounded-xl border border-border bg-background shadow-lg overflow-hidden"
                  >
                    {languages.map((lang) => {
                      const isCurrent = language === lang.code;
                      return (
                        <button
                          key={lang.code}
                          type="button"
                          role="menuitemradio"
                          aria-checked={isCurrent}
                          onClick={() => {
                            setLanguage(lang.code);
                            setIsLangOpen(false);
                          }}
                          className={cn(
                            "block w-full text-left px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:bg-primary/10",
                            isCurrent
                              ? "bg-primary text-primary-foreground"
                              : "text-primary hover:bg-primary/10",
                          )}
                        >
                          {lang.short}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Morphed layer: horizontal-scroll nav (mobile/tablet, when burger is open) */}
        <nav
          id="mobile-nav"
          aria-label="Разделы страницы"
          className={morphedNavCls}
        >
          {/* pr-14 reserves the burger zone within the scroll container's
              own padding so the last chip can still come fully into view via
              swipe (it just lives under the gradient overlay + X). */}
          <div className="flex items-center gap-2 overflow-x-auto pr-14 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x">
            {navItems.map((item) => {
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  aria-current={isActive ? "location" : undefined}
                  className={cn(
                    "snap-start shrink-0 px-3 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30 font-semibold"
                      : "bg-secondary/60 text-foreground/85 hover:bg-secondary",
                  )}
                >
                  {t(item.key)}
                </button>
              );
            })}
            {/* Lang chips trail — keep language reachable even with burger open */}
            <span className="mx-1 h-5 w-px bg-border/60 shrink-0" aria-hidden="true" />
            {languages.map((lang) => {
              const isCurrent = language === lang.code;
              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => {
                    setLanguage(lang.code);
                    setIsMenuOpen(false);
                  }}
                  aria-pressed={isCurrent}
                  className={cn(
                    "shrink-0 px-3 py-2 rounded-full text-sm font-semibold transition-colors",
                    isCurrent
                      ? "bg-primary text-primary-foreground"
                      : "bg-primary/10 text-primary hover:bg-primary/20",
                  )}
                >
                  {lang.short}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Fade-out gradient under the burger when the morphed nav is showing.
            Pure linear ramp transparent → opaque, anchored to the right edge.
            No flat-opaque plateau — that previously read as a "white panel"
            sitting between the last chip and the X. Short band (w-20 = 80px)
            so the fade is concentrated right around the burger and chips
            stay readable as long as possible before they dissolve. */}
        {isMenuOpen && (
          <div
            aria-hidden="true"
            className="nav:hidden absolute right-0 top-0 bottom-0 w-20 z-[9] pointer-events-none bg-[linear-gradient(to_right,transparent,hsl(var(--background)/0.95))]"
          />
        )}

        {/* Burger — always anchored top-right, never animates away */}
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="absolute right-3 top-1/2 -translate-y-1/2 nav:hidden p-2 rounded-lg hover:bg-secondary transition-colors z-10"
          aria-label={isMenuOpen ? "Закрыть меню" : "Открыть меню"}
          aria-expanded={isMenuOpen}
          aria-controls="mobile-nav"
        >
          {isMenuOpen ? (
            <X size={24} aria-hidden="true" />
          ) : (
            <Menu size={24} aria-hidden="true" />
          )}
        </button>
      </div>
    </header>
  );
}
