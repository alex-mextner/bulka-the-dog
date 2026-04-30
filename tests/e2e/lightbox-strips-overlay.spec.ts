import { expect, test } from "@playwright/test";

// ─── IMPORTANT NOTE ON SAFE-AREA TESTS ────────────────────────────────────────
// Playwright (Chromium) does NOT emulate env(safe-area-inset-*) from notch devices.
// Tests below that check safe-area CSS rules verify that the rules EXIST and are
// applied in the stylesheet, but cannot reproduce the actual iOS Safari + Dynamic
// Island rendering issue. Device verification on real iPhone is required.
// ──────────────────────────────────────────────────────────────────────────────

async function waitForGalleryReady(page: import("@playwright/test").Page) {
  await page
    .locator('[data-photo-strip][data-touch-mode="true"]')
    .first()
    .waitFor({ state: "attached", timeout: 15_000 });
  await page.waitForFunction(
    () => typeof (window as unknown as Record<string, unknown>).__bulkaTest === "object",
    { timeout: 5_000 },
  );
}

async function setSeedZoom(page: import("@playwright/test").Page, scale: number) {
  await page.evaluate((v) => {
    const t = (window as unknown as Record<string, unknown>).__bulkaTest as
      | { setPendingZoom: (n: number) => void; setPinchActive: (b: boolean) => void }
      | undefined;
    if (!t) throw new Error("__bulkaTest hook not present");
    t.setPendingZoom(v);
    t.setPinchActive(true);
    window.setTimeout(() => t.setPinchActive(false), 600);
  }, scale);
}

async function tapFirstPhoto(page: import("@playwright/test").Page) {
  const clicked = await page.evaluate(() => {
    const btn = document.querySelector(
      '[data-photo-strip] div.flex.flex-nowrap button',
    );
    if (!(btn instanceof HTMLElement)) return false;
    btn.click();
    return true;
  });
  expect(clicked, "no photo button found").toBe(true);
}

test.describe("Lightbox safe-area CSS rules (static checks)", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/?touch=1", { waitUntil: "load" });
    await waitForGalleryReady(page);
  });

  // NOTE: Playwright can't emulate real safe-area insets — this test verifies
  // the CSS rule exists in the stylesheet, not its visual effect on a real device.
  test("yarl portal has overflow:visible in computed style (allows full-screen clip)", async ({
    page,
  }) => {
    await tapFirstPhoto(page);
    await page.locator(".yarl__portal").waitFor({ state: "attached", timeout: 5_000 });

    const overflow = await page.evaluate(() => {
      const el = document.querySelector(".yarl__portal") as HTMLElement | null;
      if (!el) return null;
      return window.getComputedStyle(el).overflow;
    });

    expect(overflow, "portal not found").not.toBeNull();
    expect(
      overflow,
      `portal overflow should be 'visible' (got '${overflow}') — if hidden, iOS Safari may clip to visual viewport excluding safe areas`,
    ).toBe("visible");
  });

  test("yarl container still has overflow:hidden (acts as clip boundary)", async ({
    page,
  }) => {
    await tapFirstPhoto(page);
    await page.locator(".yarl__portal").waitFor({ state: "attached", timeout: 5_000 });

    const overflow = await page.evaluate(() => {
      const el = document.querySelector(".yarl__container") as HTMLElement | null;
      if (!el) return null;
      return window.getComputedStyle(el).overflow;
    });

    expect(overflow, "container not found").not.toBeNull();
    expect(
      overflow,
      `container should keep overflow:hidden as the real clip boundary (got '${overflow}')`,
    ).toBe("hidden");
  });
});

test.describe("Lightbox overlay — dismiss timing (zoom painted before fade)", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/?touch=1", { waitUntil: "load" });
    await waitForGalleryReady(page);
  });

  // RED: zoom seed must be painted BEFORE the overlay fades out.
  // If overlay dismisses at zoom=1 (before rAF applies the seed), the user
  // sees the image jump from 1x to 2.5x during the 300ms fade — visible glitch.
  //
  // Test strategy: monitor scale every rAF tick after opening. Record the scale
  // at the moment the overlay starts fading (opacity < 1). If scale < 1.5 at
  // that moment, the overlay dismissed before zoom was painted.
  test("overlay does not fade out before seed zoom is painted on the slide", async ({ page }) => {
    await setSeedZoom(page, 2.5);
    await tapFirstPhoto(page);
    await page.locator(".yarl__slide_current .yarl__fullsize").waitFor({
      state: "attached",
      timeout: 5_000,
    });

    // Poll every 50ms for up to 3s: track when overlay starts fading AND
    // what scale the slide has at that moment.
    const result = await page.evaluate(
      () =>
        new Promise<{ fadeStartScale: number | null; finalScale: number }>((resolve) => {
          let fadeStartScale: number | null = null;
          const start = Date.now();
          const poll = () => {
            if (Date.now() - start > 3000) {
              const fullsize = document.querySelector(
                ".yarl__slide_current .yarl__fullsize",
              ) as HTMLElement | null;
              const tr = fullsize?.style.transform || "";
              const m = tr.match(/scale\(([\d.]+)\)/);
              resolve({ fadeStartScale, finalScale: m ? parseFloat(m[1]) : 1 });
              return;
            }
            const overlay = document.querySelector(
              '[data-testid="pinch-thumb-overlay"]',
            ) as HTMLElement | null;
            const fullsize = document.querySelector(
              ".yarl__slide_current .yarl__fullsize",
            ) as HTMLElement | null;
            if (overlay) {
              const opacity = parseFloat(
                window.getComputedStyle(overlay).opacity || "1",
              );
              const tr = fullsize?.style.transform || "";
              const m = tr.match(/scale\(([\d.]+)\)/);
              const scale = m ? parseFloat(m[1]) : 1;
              if (opacity < 0.9 && fadeStartScale === null) {
                fadeStartScale = scale;
              }
            }
            requestAnimationFrame(poll);
          };
          requestAnimationFrame(poll);
        }),
    );

    expect(result.finalScale, "final scale should be ≥ 2.0 (seed applied)").toBeGreaterThan(2.0);
    expect(
      result.fadeStartScale,
      "overlay fade should start only after zoom is painted (got null = overlay never faded, which is also a bug)",
    ).not.toBeNull();
    expect(
      result.fadeStartScale!,
      `overlay started fading at scale=${result.fadeStartScale} — zoom not yet painted (expected ≥ 2.0)`,
    ).toBeGreaterThan(2.0);
  });
});
