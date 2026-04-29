import { expect, test } from "@playwright/test";

// Habits scrollytelling — sticky photo tests.
//
// Mobile: single photo at top, sticky top = 4.5rem + safe-area-top.
// Desktop: two stacked photos on left, sticky top = 6rem (top-24).
//
// Key invariant: after scrolling INTO the habits section (past the heading),
// the sticky photo must be at its threshold top value — NOT scrolled away
// and NOT above the threshold.
//
// Chromium with iPhone UA: safe-area-inset-top = 0 (no notch emulation),
// so expected sticky top ≈ 72px (4.5rem = 72px).

const HEADER_HEIGHT_PX = 60; // approx visible header height in test env
const MOBILE_STICKY_TOP = 72; // 4.5rem = 72px, safe-area = 0 in Chromium
const DESKTOP_STICKY_TOP = 96; // top-24 = 96px

async function scrollPastHabitsHeading(page: import("@playwright/test").Page, extraPx = 300) {
  // Scroll so the habits heading leaves the viewport and we're mid-section.
  await page.evaluate((extra) => {
    const heading = document.getElementById("habits-title");
    if (!heading) return;
    const rect = heading.getBoundingClientRect();
    window.scrollBy(0, rect.bottom + extra);
  }, extraPx);
  await page.waitForTimeout(150);
}

test.describe("Habits sticky photo — mobile", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });
    await page.waitForSelector("[data-habit-item]", { timeout: 10_000 });
  });

  // ── RED: sticky photo sticks at top while scrolling through items ──────────
  // Fails when: (a) calc() syntax is invalid so `top` has no value → position:sticky
  // never activates, or (b) top value is wrong.
  test("sticky photo stays at threshold after scrolling into section", async ({ page }) => {
    await scrollPastHabitsHeading(page, 200);

    const top = await page.evaluate(() => {
      const el = document.querySelector(
        "[data-mobile-photo-stick]",
      ) as HTMLElement | null;
      if (!el) return null;
      return el.getBoundingClientRect().top;
    });

    expect(top, "mobile sticky photo not found in DOM").not.toBeNull();
    // Should be stuck near MOBILE_STICKY_TOP (72px), not scrolled off-screen.
    // Allow ±20px for subpixel rounding and header measurement variance.
    expect(top!, `sticky photo scrolled away (top=${top})`).toBeGreaterThan(0);
    expect(top!, `sticky photo above threshold (top=${top})`).toBeLessThan(
      MOBILE_STICKY_TOP + 20,
    );
  });

  test("sticky photo is still visible halfway through the section", async ({ page }) => {
    // Scroll to the middle of the habit items — the 4th item.
    await page.evaluate(() => {
      const items = document.querySelectorAll("[data-habit-item]");
      items[3]?.scrollIntoView({ block: "center" });
    });
    await page.waitForTimeout(150);

    const { photoTop, photoBottom } = await page.evaluate(() => {
      const el = document.querySelector(
        "[data-mobile-photo-stick]",
      ) as HTMLElement | null;
      if (!el) return { photoTop: null, photoBottom: null };
      const r = el.getBoundingClientRect();
      return { photoTop: r.top, photoBottom: r.bottom };
    });

    expect(photoTop, "photo not found").not.toBeNull();
    // Photo must still be inside the viewport (bottom > 0 and top < vh).
    expect(
      photoBottom!,
      `photo completely above viewport (bottom=${photoBottom})`,
    ).toBeGreaterThan(0);
    expect(
      photoTop!,
      `photo below viewport (top=${photoTop})`,
    ).toBeLessThan(844);
  });

  test("mobile sticky photo has position:sticky in computed style", async ({ page }) => {
    const pos = await page.evaluate(() => {
      const el = document.querySelector("[data-mobile-photo-stick]") as HTMLElement | null;
      if (!el) return null;
      return window.getComputedStyle(el).position;
    });
    expect(pos, "element not found").not.toBeNull();
    expect(pos, "expected position:sticky").toBe("sticky");
  });

  test("mobile sticky photo has valid (non-zero) computed top threshold", async ({ page }) => {
    // If calc() syntax is broken, computed top resolves to 0px or 'auto',
    // which means sticky never activates properly.
    const topValue = await page.evaluate(() => {
      const el = document.querySelector("[data-mobile-photo-stick]") as HTMLElement | null;
      if (!el) return null;
      return window.getComputedStyle(el).top;
    });
    expect(topValue, "element not found").not.toBeNull();
    // Should resolve to a pixel value matching 4.5rem (~72px in 16px base).
    // Not 'auto', not '0px'.
    expect(topValue, `top should be ~72px, got '${topValue}'`).not.toBe("auto");
    const px = parseFloat(topValue!);
    expect(px, `top should be ≥ 60px (header height), got ${px}px`).toBeGreaterThanOrEqual(60);
  });

  // ── RED: sticky photo container must have an opaque background ──────────────
  // Without a background, scrolling content (h3 titles from habit items above)
  // bleeds through the transparent container and is visible on top of the photo.
  test("mobile sticky photo container has opaque background (no text bleed-through)", async ({
    page,
  }) => {
    const bg = await page.evaluate(() => {
      const el = document.querySelector(
        "[data-mobile-photo-stick]",
      ) as HTMLElement | null;
      if (!el) return null;
      return window.getComputedStyle(el).backgroundColor;
    });
    expect(bg, "element not found").not.toBeNull();
    // transparent / rgba(0,0,0,0) means content from behind will bleed through
    expect(
      bg,
      `sticky container background is transparent ('${bg}') — scrolling content bleeds through`,
    ).not.toBe("rgba(0, 0, 0, 0)");
    expect(bg, "sticky container background must not be 'transparent'").not.toBe(
      "transparent",
    );
  });
});

test.describe("Habits sticky photo — desktop", () => {
  test.use({
    viewport: { width: 1280, height: 800 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });
    await page.waitForSelector("[data-habit-item]", { timeout: 10_000 });
  });

  test("desktop sticky photo column has position:sticky in computed style", async ({ page }) => {
    const pos = await page.evaluate(() => {
      const el = document.querySelector("[data-desktop-photo-stick]") as HTMLElement | null;
      if (!el) return null;
      return window.getComputedStyle(el).position;
    });
    expect(pos, "desktop sticky column not found").not.toBeNull();
    expect(pos, "expected position:sticky").toBe("sticky");
  });

  test("desktop sticky column stays at threshold while scrolling mid-section", async ({ page }) => {
    await scrollPastHabitsHeading(page, 300);

    const top = await page.evaluate(() => {
      const el = document.querySelector("[data-desktop-photo-stick]") as HTMLElement | null;
      if (!el) return null;
      return el.getBoundingClientRect().top;
    });

    expect(top, "desktop sticky column not found").not.toBeNull();
    // Should be at roughly DESKTOP_STICKY_TOP (96px) when stuck.
    expect(top!, `sticky column scrolled away (top=${top})`).toBeGreaterThan(0);
    expect(top!, `sticky column above threshold (top=${top})`).toBeLessThan(
      DESKTOP_STICKY_TOP + 30,
    );
  });

  test("desktop sticky photos are clearly shorter than text items column", async ({ page }) => {
    // For sticky to be noticeable, the sticky column must be shorter than the
    // text column. If they're similar height, scroll range is too small to notice.
    const heights = await page.evaluate(() => {
      const stickyCol = document.querySelector("[data-desktop-photo-stick]") as HTMLElement | null;
      const itemsCol = document.querySelector("[data-habit-item]")?.parentElement as HTMLElement | null;
      if (!stickyCol || !itemsCol) return null;
      return {
        sticky: stickyCol.getBoundingClientRect().height,
        items: itemsCol.getBoundingClientRect().height,
      };
    });

    expect(heights, "could not measure column heights").not.toBeNull();
    // Sticky column should be at least 200px shorter than items column so
    // the sticky travel is meaningful.
    const diff = heights!.items - heights!.sticky;
    expect(
      diff,
      `sticky column (${heights!.sticky}px) too close in height to items column (${heights!.items}px); diff=${diff}px; need ≥200px for sticky to be noticeable`,
    ).toBeGreaterThanOrEqual(200);
  });
});
