import { expect, test } from "@playwright/test";

// Helper: parse the X offset from "translate3d(-Xpx, 0, 0)".
// Returns NaN if the transform is not in that form.
function parseOffset(transform: string): number {
  const m = transform.match(/translate3d\(([-\d.]+)px/);
  return m ? -parseFloat(m[1]) : NaN;
}

// Helper: read the current strip track transform via the DOM.
async function getOffset(page: Parameters<typeof test>[1]["page"]): Promise<number> {
  return page.evaluate(() => {
    const vp = document.querySelector('[data-photo-strip]') as HTMLElement | null;
    const track = vp?.firstElementChild as HTMLElement | null;
    if (!track) return NaN;
    const t = track.style.transform;
    const m = t.match(/translate3d\(([-\d.]+)px/);
    return m ? -parseFloat(m[1]) : NaN;
  });
}

// Scroll the page programmatically by a total of `totalDelta` px in
// `steps` increments with `delayMs` between each, simulating continuous
// vertical swipe.
async function simulatePageScroll(
  page: Parameters<typeof test>[1]["page"],
  totalDelta: number,
  steps: number,
  delayMs: number,
): Promise<void> {
  const delta = totalDelta / steps;
  for (let i = 0; i < steps; i++) {
    await page.evaluate((d) => window.scrollBy(0, d), delta);
    await page.waitForTimeout(delayMs);
  }
}

test.describe("PhotoStrip scroll-boost", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?touch=1", { waitUntil: "load" });
    // Wait until touch mode is active (SSG hydration flips the attribute).
    await page.waitForSelector('[data-photo-strip][data-touch-mode="true"]', {
      timeout: 8_000,
    });
    // Scroll gallery section into view so IntersectionObserver fires.
    await page.evaluate(() => {
      document.getElementById("gallery")?.scrollIntoView({ behavior: "instant" });
    });
    // Give IntersectionObserver time to fire (~100ms is enough; we allow 300ms).
    await page.waitForTimeout(300);
  });

  test("fast downward scroll moves strip to the right", async ({ page }) => {
    const before = await getOffset(page);

    // Fast downward scroll: 600px over 6 steps × 25ms ≈ 400px/s page velocity.
    // With SCROLL_BOOST_FACTOR=0.5 that injects ~200px/s strip velocity.
    await simulatePageScroll(page, 600, 6, 25);
    await page.waitForTimeout(400); // let inertia animate

    const after = await getOffset(page);
    expect(isNaN(before) || isNaN(after)).toBe(false);
    // Strip offset should have increased (moved right).
    expect(after).toBeGreaterThan(before);
  });

  test("fast upward scroll moves strip to the left", async ({ page }) => {
    // First push the strip to a non-zero offset so there is room to scroll left.
    await simulatePageScroll(page, 600, 6, 25);
    await page.waitForTimeout(500);

    const midOffset = await getOffset(page);
    // Ensure we actually have positive offset to scroll back from.
    expect(midOffset).toBeGreaterThan(10);

    // Now scroll up (negative delta).
    await simulatePageScroll(page, -600, 6, 25);
    await page.waitForTimeout(400);

    const after = await getOffset(page);
    expect(after).toBeLessThan(midOffset);
  });

  test("slow scroll produces smaller displacement than fast scroll", async ({
    page,
  }) => {
    // The scroll-boost mechanism is velocity-driven (px/s from a 150ms sliding
    // window). Fast scroll at ~4000px/s → boost ~2000px/s; slow scroll at
    // ~500px/s → boost ~250px/s. Both runs use the SAME wall-clock duration
    // (~200ms of active scroll) so the only variable is page velocity.
    //
    // Root cause of original flakiness: after scrollIntoView the gallery is at
    // the very bottom of the page (gallery is the last section), so
    // window.scrollBy(0, +N) is a no-op and generates zero scroll events —
    // boost never fires. Fix: scroll UP by 500px before each run to open
    // headroom for the downward burst while keeping the strip inside the
    // viewport (IO threshold 0.1 is still satisfied; empirically verified
    // down to -500px offset from scrollIntoView position).

    // Fast run: 800px in 8 × 25ms ≈ 200ms at ~4000px/s page velocity.
    await page.evaluate(() => window.scrollBy(0, -500));
    await page.waitForTimeout(200); // let IntersectionObserver re-confirm visible
    const beforeFast = await getOffset(page);
    await simulatePageScroll(page, 800, 8, 25); // ~4000px/s
    await page.waitForTimeout(500);
    const fastDisplacement = (await getOffset(page)) - beforeFast;

    // Re-load to reset strip to offset ≈ 0.
    await page.goto("/?touch=1", { waitUntil: "load" });
    await page.waitForSelector('[data-photo-strip][data-touch-mode="true"]', { timeout: 8_000 });
    await page.evaluate(() => {
      document.getElementById("gallery")?.scrollIntoView({ behavior: "instant" });
    });
    await page.waitForTimeout(300);

    // Slow run: 100px in 8 × 25ms ≈ 200ms at ~500px/s page velocity.
    await page.evaluate(() => window.scrollBy(0, -500));
    await page.waitForTimeout(200);
    const beforeSlow = await getOffset(page);
    await simulatePageScroll(page, 100, 8, 25); // ~500px/s
    await page.waitForTimeout(500);
    const slowDisplacement = (await getOffset(page)) - beforeSlow;

    // Fast scroll (8× higher velocity) must produce strictly more displacement.
    expect(fastDisplacement).toBeGreaterThan(slowDisplacement);
  });

  test("strip does not accelerate while gallery is off-screen", async ({
    page,
  }) => {
    // Scroll all the way to the top. Gallery is in the last section, so
    // scrollY=0 puts it well below the viewport.
    await page.evaluate(() => window.scrollTo(0, 0));
    // Wait for IntersectionObserver to mark the strip as not visible.
    await page.waitForSelector('[data-photo-strip][data-strip-visible="false"]', {
      timeout: 5_000,
    });

    // Measure baseline drift over 600ms (strip is always moving at baseSpeed).
    const t0 = await getOffset(page);
    await page.waitForTimeout(600);
    const t600 = await getOffset(page);
    const baselineDrift = Math.abs(t600 - t0); // ~10px at 16px/s

    // Now scroll down 400px quickly — gallery is still off-screen (it's deep
    // in the page; 400px of scroll is just the hero section).
    await simulatePageScroll(page, 400, 5, 20);
    await page.waitForTimeout(400);
    const afterScroll = await getOffset(page);
    const scrollDrift = Math.abs(afterScroll - t600);

    // If boost fired, scrollDrift would be hundreds of px. Pure drift over
    // 600ms is ~10px. Allow 4× tolerance for timing slop.
    expect(scrollDrift).toBeLessThanOrEqual(Math.max(baselineDrift * 4, 30));
  });

  test("strip continues drifting after scroll ends (inertia hand-off)", async ({
    page,
  }) => {
    // Record position right after scroll finishes.
    await simulatePageScroll(page, 400, 5, 25);
    const atEnd = await getOffset(page);

    // Wait 250ms — inertia should still be carrying the strip.
    await page.waitForTimeout(250);
    const after250 = await getOffset(page);

    // And 500ms more.
    await page.waitForTimeout(500);
    const after750 = await getOffset(page);

    // Strip should keep moving for a while after scroll stops (inertia decay).
    expect(after250).toBeGreaterThan(atEnd);
    expect(after750).toBeGreaterThan(atEnd);
  });

  test("multiple bursts from different starting positions all produce motion", async ({
    page,
  }) => {
    test.setTimeout(30_000);

    const startOffsets = [0, 200, 400];
    for (const startOff of startOffsets) {
      // Re-load each iteration for a clean state.
      await page.goto("/?touch=1", { waitUntil: "load" });
      await page.waitForSelector('[data-photo-strip][data-touch-mode="true"]', {
        timeout: 8_000,
      });
      await page.evaluate(() => {
        document.getElementById("gallery")?.scrollIntoView({ behavior: "instant" });
      });
      await page.waitForTimeout(300);

      // Manually push the strip to the desired starting offset via inertia.
      if (startOff > 0) {
        await page.evaluate((off) => {
          // Directly set offset ref by injecting via the track transform,
          // then let the rAF loop update from there. We do it the hard way:
          // just scroll so the strip ends up roughly at `off` px.
          window.scrollBy(0, off * 2);
        }, startOff);
        await page.waitForTimeout(600);
      }

      const before = await getOffset(page);
      await simulatePageScroll(page, 400, 5, 25);
      await page.waitForTimeout(400);
      const after = await getOffset(page);

      expect(
        after,
        `starting from ~${startOff}px offset: strip should have moved`,
      ).not.toBeCloseTo(before, -1); // tolerance: differ by >10px
    }
  });

  test("scrolling both directions alternately reverses strip direction", async ({
    page,
  }) => {
    // Down first.
    await simulatePageScroll(page, 400, 5, 25);
    await page.waitForTimeout(300);
    const afterDown = await getOffset(page);

    // Up.
    await simulatePageScroll(page, -400, 5, 25);
    await page.waitForTimeout(300);
    const afterUp = await getOffset(page);

    // Down again moved right, up should have moved left (or at least less right).
    expect(afterUp).toBeLessThan(afterDown);
  });
});
