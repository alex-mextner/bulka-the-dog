import { expect, test } from "@playwright/test";

// Habits scrollytelling — sticky photo tests.
//
// Mobile: single photo at top, sticky top = 61px + safe-area-top.
//   61px = h-[60px] inner div + 1px border-b.
//   Previously was `4.5rem + safe-area` (72px) which left an 11px gap where
//   the previous section's text was visible above the sticky photo.
// Desktop: two stacked photos on left, sticky top = 6rem (top-24).
//
// Key invariant: after scrolling INTO the habits section (past the heading),
// the sticky photo top must align with the header bottom (±5px).
//
// Chromium with iPhone UA: safe-area-inset-top = 0 (no notch emulation).

const MOBILE_STICKY_TOP = 61; // 60px (h-[60px]) + 1px border-b = 61px
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

  // ── sticky photo sticks at top:0, covering the full zone from top of viewport ─
  // With top:0 + paddingTop = header height, the bg-background covers the gap
  // between 0 and the photo content. The container itself should be at y=0.
  test("sticky photo container is at y=0 after scrolling into section (no gap)", async ({ page }) => {
    await scrollPastHabitsHeading(page, 200);

    const { containerTop, photoContentTop, headerBottom } = await page.evaluate(() => {
      const container = document.querySelector(
        "[data-mobile-photo-stick]",
      ) as HTMLElement | null;
      const header = document.querySelector("header") as HTMLElement | null;
      if (!container || !header) return { containerTop: null, photoContentTop: null, headerBottom: null };
      const containerRect = container.getBoundingClientRect();
      // Photo content starts after the padding-top, i.e. at the first child.
      const firstChild = container.firstElementChild as HTMLElement | null;
      const contentTop = firstChild ? firstChild.getBoundingClientRect().top : containerRect.top;
      return {
        containerTop: containerRect.top,
        photoContentTop: contentTop,
        headerBottom: header.getBoundingClientRect().bottom,
      };
    });

    expect(containerTop, "mobile sticky photo container not found").not.toBeNull();
    expect(headerBottom, "header not found").not.toBeNull();
    // Container must be at top:0 — it covers the full gap from y=0.
    expect(
      containerTop!,
      `sticky container top should be ~0 (got ${containerTop}px) — container doesn't start at viewport top`,
    ).toBeLessThan(5);
    // Photo content (after padding) must align with header bottom — no visible gap.
    const contentGap = photoContentTop! - headerBottom!;
    expect(
      contentGap,
      `photo content top (${photoContentTop}px) not aligned with header bottom (${headerBottom}px); gap=${contentGap}px`,
    ).toBeLessThan(5);
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

  test("mobile sticky photo computed top is 0px (container starts at viewport top)", async ({ page }) => {
    // The container uses top:0 + paddingTop = header height so bg-background
    // covers the full zone from y=0 and prevents text bleed-through.
    const topValue = await page.evaluate(() => {
      const el = document.querySelector("[data-mobile-photo-stick]") as HTMLElement | null;
      if (!el) return null;
      return window.getComputedStyle(el).top;
    });
    expect(topValue, "element not found").not.toBeNull();
    expect(topValue, `top should not be 'auto', got '${topValue}'`).not.toBe("auto");
    const px = parseFloat(topValue!);
    expect(px, `top should be 0px (container at viewport top), got ${px}px`).toBe(0);
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

  // ── RED Bug 1: no bleed zone between header bottom and sticky photo top ────
  // If sticky top = 4.5rem and the container starts exactly there, any habit
  // item text that scrolls through the gap between headerBottom..photoTop is
  // visible ON TOP of the sticky photo.  The fix is to make the container
  // start at top:0 with padding-top:4.5rem so bg-background covers the gap.
  test("no gap between header bottom and sticky photo top (text bleed bug)", async ({ page }) => {
    await scrollPastHabitsHeading(page, 150);

    const { headerBottom, photoTop } = await page.evaluate(() => {
      const header = document.querySelector("header") as HTMLElement | null;
      const photo = document.querySelector("[data-mobile-photo-stick]") as HTMLElement | null;
      if (!header || !photo) return { headerBottom: null, photoTop: null };
      return {
        headerBottom: header.getBoundingClientRect().bottom,
        photoTop: photo.getBoundingClientRect().top,
      };
    });

    expect(headerBottom, "header not found").not.toBeNull();
    expect(photoTop, "sticky photo not found").not.toBeNull();
    // The sticky container background must cover from the header bottom all the
    // way to the photo content. If photoTop > headerBottom there is a transparent
    // gap where text can bleed through.
    expect(
      photoTop!,
      `gap between header bottom (${headerBottom}px) and photo top (${photoTop}px) — text bleeds through`,
    ).toBeLessThanOrEqual(headerBottom! + 4);
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

// ── Bug 2: habitsActiveIdx must match the habit item currently in reading position ──
// The "max visible pixels" algorithm picks the LONGEST item in view, not the one
// the user is actually reading.  "In the car" (idx=3, lena_dogs) is short, so when
// it and "At home" (idx=4, bulka_tv) overlap in the visible area, bulka_tv wins.
test.describe("Habits photo — correct active index (mobile)", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });
    await page.waitForSelector("[data-habit-item]", { timeout: 10_000 });
  });

  // Scroll so the 4th habit item (🚗 car, idx=3) sits just below the sticky photo
  // and is the first fully-entering item — then the visible photo must be lena_dogs,
  // NOT bulka_tv (which is the next longer item).
  test("car item (idx=3) triggers lena_dogs photo, not bulka_tv", async ({ page }) => {
    // Step 1: scroll into habits section so the sticky photo is active (stuck at top:0).
    await page.evaluate(() => {
      const heading = document.getElementById("habits-title");
      if (heading) window.scrollBy(0, heading.getBoundingClientRect().bottom + 50);
    });
    await page.waitForTimeout(150);

    // Pre-condition: lena_dogs must NOT be visible yet after the initial scroll.
    // If it is already visible here, waitForFunction below would resolve
    // immediately on stale state and the test would false-pass even if the
    // "item[3] at reading position → lena_dogs" logic regressed.
    const srcBeforeStep2 = await page.evaluate(() => {
      const container = document.querySelector(
        "[data-mobile-photo-stick]",
      ) as HTMLElement | null;
      if (!container) return null;
      const imgs = Array.from(container.querySelectorAll("img"));
      for (const img of imgs) {
        if ((img as HTMLImageElement).style.opacity === "1")
          return (img as HTMLImageElement).src;
      }
      return null;
    });
    expect(
      srcBeforeStep2,
      "lena_dogs must not already be visible before scroll-to-item[3] — " +
        "if it is, the waitForFunction below tests nothing",
    ).not.toContain("lena_dogs");

    // Step 2: now that sticky is active, measure its stuck height, then scroll
    // so item[3]'s top lands just below the sticky photo bottom.
    await page.evaluate(() => {
      const items = document.querySelectorAll<HTMLElement>("[data-habit-item]");
      const sticky = document.querySelector<HTMLElement>("[data-mobile-photo-stick]");
      if (!sticky || !items[3]) return;
      // Sticky is now stuck at y=0, so getBoundingClientRect().bottom = its rendered height.
      const stickyBottom = sticky.getBoundingClientRect().bottom;
      const item = items[3];
      const rect = item.getBoundingClientRect();
      // Place item[3].top exactly at stickyBottom so it's the first item in view.
      const targetScrollY = window.scrollY + rect.top - stickyBottom;
      window.scrollTo({ top: Math.max(0, targetScrollY), behavior: "instant" });
    });

    // Wait for scroll handlers + photo fade to settle. Poll instead of a
    // fixed timeout so the test doesn't flake under load in a full suite run.
    await page.waitForFunction(
      () => {
        const container = document.querySelector("[data-mobile-photo-stick]");
        if (!container) return false;
        const imgs = Array.from(container.querySelectorAll("img")) as HTMLImageElement[];
        // Resolve as soon as lena_dogs is the visible photo.
        return imgs.some(
          (img) => img.style.opacity === "1" && img.src.includes("lena_dogs"),
        );
      },
      { timeout: 3_000 },
    ).catch(() => {
      // If we time out, fall through — the assertion below will report the
      // actual visible src so the failure is readable.
    });

    const visibleSrc = await page.evaluate(() => {
      // Find the img inside the MOBILE sticky photo container that has opacity 1.
      const container = document.querySelector("[data-mobile-photo-stick]") as HTMLElement | null;
      if (!container) return null;
      const imgs = Array.from(container.querySelectorAll("img"));
      for (const img of imgs) {
        if (img.style.opacity === "1") return img.src;
      }
      return null;
    });

    expect(visibleSrc, "no visible photo found in sticky container").not.toBeNull();
    expect(
      visibleSrc!,
      `expected lena_dogs photo when car item is at reading position, got: ${visibleSrc}`,
    ).toContain("lena_dogs");
  });

  // Active index must not skip backwards as user scrolls forward through all items.
  test("active index is monotonically non-decreasing while scrolling forward", async ({ page }) => {
    const indices: number[] = [];

    // Scroll through the entire habits section step by step.
    const itemCount = await page.evaluate(() =>
      document.querySelectorAll("[data-habit-item]").length,
    );

    for (let i = 0; i < itemCount; i++) {
      await page.evaluate((idx) => {
        const items = document.querySelectorAll("[data-habit-item]");
        items[idx]?.scrollIntoView({ block: "start" });
      }, i);
      await page.waitForTimeout(150);

      const activeIdx = await page.evaluate(() => {
        const container = document.querySelector("[data-mobile-photo-stick]") as HTMLElement | null;
        if (!container) return -1;
        const imgs = Array.from(container.querySelectorAll("img"));
        for (let j = 0; j < imgs.length; j++) {
          if (imgs[j].style.opacity === "1") return j;
        }
        return -1;
      });
      indices.push(activeIdx);
    }

    // Verify no backward jumps.
    for (let i = 1; i < indices.length; i++) {
      expect(
        indices[i],
        `active index jumped backward from ${indices[i - 1]} to ${indices[i]} at step ${i}`,
      ).toBeGreaterThanOrEqual(indices[i - 1]);
    }
  });
});
