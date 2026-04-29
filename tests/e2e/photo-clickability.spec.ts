import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

// Tests that photos in the Habits section and PhotoStrip are clickable
// and open the lightbox on tap.

test.use({
  viewport: { width: 390, height: 844 },
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
});

async function waitForPageReady(page: Page) {
  // Wait for the page to fully load and gallery context to mount.
  await page.waitForSelector("[data-habit-item]", { timeout: 15_000 });
  // Wait for PhotoStrip to mount (it has data-photo-strip attribute).
  await page.waitForSelector("[data-photo-strip]", { timeout: 10_000 });
}

test.describe("Photo clickability", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?touch=1", { waitUntil: "load" });
    await waitForPageReady(page);
  });

  // ── Habits section: sticky photo opens lightbox on click ─────────────────
  test("habits photo is clickable and opens lightbox", async ({ page }) => {
    // Scroll into the habits section so the sticky photo is visible.
    await page.evaluate(() => {
      const section = document.getElementById("habits");
      if (section) section.scrollIntoView();
      // Scroll a bit further so a habit item is in view and sticky photo shows.
      window.scrollBy(0, 200);
    });
    await page.waitForTimeout(200);

    // Find the clickable element in the mobile sticky photo container.
    // After fix: it should be a <button> wrapping the photo fader.
    const clicked = await page.evaluate(() => {
      const stick = document.querySelector(
        "[data-mobile-photo-stick]",
      ) as HTMLElement | null;
      if (!stick) return "no-stick";
      // Look for a button inside the sticky photo container.
      const btn = stick.querySelector("button");
      if (btn) {
        btn.click();
        return "button-clicked";
      }
      // Fallback: check if the container itself is clickable.
      const clickable = stick.querySelector("[role='button'], button, [tabindex]");
      if (clickable) {
        (clickable as HTMLElement).click();
        return "clickable-found";
      }
      return "no-button";
    });

    expect(
      clicked,
      `Expected a clickable element in [data-mobile-photo-stick], got: ${clicked}`,
    ).not.toBe("no-button");
    expect(
      clicked,
      `Expected [data-mobile-photo-stick] to contain a button`,
    ).not.toBe("no-stick");

    // Lightbox should appear after click.
    await page.locator(".yarl__portal").waitFor({ state: "attached", timeout: 5_000 });
  });

  // ── PhotoFader: pinch seed + tap opens lightbox at zoom (habits section) ──
  // Verifies that usePinchToOpen is correctly wired in PhotoFader: when the
  // seed zoom is pre-set via __bulkaTest (mimicking a real pinch gesture) and
  // the PhotoFader button is tapped, the lightbox opens with the seed scale
  // applied — the same behaviour as GalleryImage thumbnails.
  test("habits PhotoFader: seed zoom carries through to lightbox", async ({ page }) => {
    // Wait for __bulkaTest hook.
    await page.waitForFunction(
      () => typeof (window as unknown as Record<string, unknown>).__bulkaTest === "object",
      { timeout: 10_000 },
    );

    // Scroll into habits section.
    await page.evaluate(() => {
      const section = document.getElementById("habits");
      if (section) section.scrollIntoView();
      window.scrollBy(0, 200);
    });
    await page.waitForTimeout(200);

    // Set seed zoom (mimics user having pinched to 2x).
    await page.evaluate(() => {
      const t = (window as unknown as Record<string, unknown>).__bulkaTest as
        | { setPendingZoom: (n: number) => void; setPinchActive: (b: boolean) => void }
        | undefined;
      if (!t) throw new Error("__bulkaTest not present");
      t.setPendingZoom(2.0);
      t.setPinchActive(true);
      window.setTimeout(() => t.setPinchActive(false), 600);
    });

    // Click the PhotoFader button in the mobile sticky container.
    const clicked = await page.evaluate(() => {
      const stick = document.querySelector("[data-mobile-photo-stick]") as HTMLElement | null;
      if (!stick) return "no-stick";
      const btn = stick.querySelector("button");
      if (!btn) return "no-button";
      btn.click();
      return "clicked";
    });
    expect(clicked, `PhotoFader button not found: ${clicked}`).toBe("clicked");

    // Lightbox must open.
    await page.locator(".yarl__slide_current .yarl__fullsize").waitFor({
      state: "attached",
      timeout: 5_000,
    });

    // Allow rAF poll to apply the seed zoom.
    await page.waitForTimeout(600);

    // Verify the scale applied is meaningfully above 1 (seed was 2.0).
    const scale = await page.evaluate(() => {
      const el = document.querySelector(".yarl__slide_current .yarl__fullsize");
      if (!(el instanceof HTMLElement)) return null;
      const m = el.style.transform?.match(/scale\(([\d.]+)\)/);
      return m ? parseFloat(m[1]) : null;
    });
    expect(scale, `Expected slide scale > 1.5 (seed=2.0), got ${scale}`).not.toBeNull();
    expect(scale!).toBeGreaterThan(1.5);
  });

  // ── PhotoStrip: at least one visible photo in strip is clickable ──────────
  test("photostrip photos are clickable and open lightbox", async ({ page }) => {
    // Scroll to the gallery section.
    await page.evaluate(() => {
      const section = document.getElementById("gallery");
      if (section) section.scrollIntoView();
    });
    await page.waitForTimeout(200);

    // Click the first button in the photo strip.
    const clicked = await page.evaluate(() => {
      const strip = document.querySelector("[data-photo-strip]") as HTMLElement | null;
      if (!strip) return "no-strip";
      const btn = strip.querySelector("button");
      if (!btn) return "no-button";
      btn.click();
      return "clicked";
    });

    expect(clicked, "Expected a button in [data-photo-strip]").toBe("clicked");

    await page.locator(".yarl__portal").waitFor({ state: "attached", timeout: 5_000 });
  });
});
