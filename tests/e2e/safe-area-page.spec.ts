import { expect, test } from "@playwright/test";

// Tests that the main page background covers the iOS safe-area zone at the
// bottom of the screen (home indicator strip) when scrolled to the end.
//
// Root cause: `100vh` on mobile Safari is the "large viewport" height (before
// address-bar collapse). When the bar collapses the visual viewport shrinks,
// but the page layout stays at the tall size — so the bottom of the document
// can fall short of the visual viewport bottom, leaving the raw <html>
// background exposed in the safe-area zone.
//
// Fix required:
//   1. `html` must have a background-color matching --background so the safe-area
//      strip (which paints on top of the html element) doesn't show a white/grey
//      gap.
//   2. The root layout wrapper should use min-height: 100dvh (dynamic viewport)
//      instead of 100vh so the page always fills the current visual viewport.

test.describe("Page safe-area bottom coverage", () => {
  test.beforeEach(async ({ page }) => {
    // Simulate iOS safe-area-inset-bottom of 34px (standard iPhone home indicator)
    // We inject it before navigation so any layout that reads the var on first
    // paint gets the right value.
    await page.addInitScript(() => {
      // Override env() for safe-area-inset-bottom can't be done from JS —
      // we inject a CSS override via a style element instead.
      // (Playwright addStyleTag runs after DOMContentLoaded, so we do it in
      // addInitScript via a MutationObserver that fires on first DOM mutation.)
      const style = document.createElement("style");
      style.textContent = ":root { --safe-area-bottom: 34px; }";
      document.addEventListener("DOMContentLoaded", () => {
        document.head.appendChild(style);
      });
    });
    await page.goto("/", { waitUntil: "load" });
  });

  // ── html element has a background colour ─────────────────────────────────────
  //
  // The safe-area zone (home indicator strip) is painted on the <html> canvas
  // in iOS Safari. If html has no background-color, the UA default (white or
  // system background) shows through as a thin stripe at the very bottom edge.
  test("html element has a non-transparent background colour", async ({
    page,
  }) => {
    const htmlBg = await page.evaluate(() =>
      window.getComputedStyle(document.documentElement).backgroundColor,
    );

    // Should NOT be transparent or the default opaque white (rgb(255,255,255))
    // of the UA stylesheet. We just need it to be explicitly set and opaque.
    expect(
      htmlBg,
      `html background should be explicitly set (not transparent), got: ${htmlBg}`,
    ).not.toBe("rgba(0, 0, 0, 0)");

    expect(
      htmlBg,
      `html background should not be bare white (UA default), got: ${htmlBg}`,
    ).not.toBe("rgb(255, 255, 255)");
  });

  // ── footer covers the safe-area zone at the bottom ───────────────────────────
  //
  // When scrolled to the very bottom of the page, the footer's bottom edge
  // should reach (or exceed) the visual viewport bottom. This ensures the
  // footer background—not a raw html/body background—is what the user sees in
  // the home indicator zone.
  test("footer bottom edge reaches the viewport bottom when scrolled down", async ({
    page,
  }) => {
    // Scroll to the absolute bottom of the page.
    await page.evaluate(() =>
      window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }),
    );
    // Give layout a frame to settle.
    await page.waitForTimeout(100);

    const result = await page.evaluate(() => {
      const footer = document.querySelector("footer");
      if (!footer) return { error: "no footer", footerBottom: 0, viewportHeight: 0 };
      const rect = footer.getBoundingClientRect();
      return {
        error: null,
        footerBottom: rect.bottom,
        viewportHeight: window.innerHeight,
      };
    });

    expect(result.error, "footer element must exist").toBeNull();

    // Footer bottom must reach at least as far as the viewport bottom (innerHeight).
    // A small tolerance of 2px accounts for sub-pixel rounding.
    expect(
      result.footerBottom,
      `footer.getBoundingClientRect().bottom (${result.footerBottom}) should be >= viewport height (${result.viewportHeight})`,
    ).toBeGreaterThanOrEqual(result.viewportHeight - 2);
  });

  // ── footer has enough bottom padding to cover safe-area ─────────────────────
  //
  // The footer must have padding-bottom >= the safe-area inset so its
  // background visually covers the home indicator strip on notch devices.
  test("footer padding-bottom accounts for safe-area-bottom", async ({
    page,
  }) => {
    const paddingBottom = await page.evaluate(() => {
      const footer = document.querySelector("footer");
      if (!footer) return -1;
      // getComputedStyle gives the resolved px value.
      return parseFloat(window.getComputedStyle(footer).paddingBottom);
    });

    expect(paddingBottom, "footer must be found").toBeGreaterThan(0);

    // With --safe-area-bottom: 34px injected, footer padding-bottom must be
    // at least 34px so the background extends into the safe-area zone.
    expect(
      paddingBottom,
      `footer padding-bottom (${paddingBottom}px) must be >= 34px to cover safe-area`,
    ).toBeGreaterThanOrEqual(34);
  });
});
