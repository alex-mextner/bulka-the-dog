import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const FIRST_STRIP_BUTTON = '[data-photo-strip] div.flex.flex-nowrap button';
const portraitFixtureSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">
  <rect width="800" height="1000" fill="#0f172a"/>
  <rect x="80" y="120" width="640" height="760" fill="#f97316"/>
  <circle cx="400" cy="500" r="180" fill="#f8fafc"/>
</svg>`;

// Test for pinch-to-open black-screen fix:
//   When user releases pinch fingers before the full-resolution image has
//   loaded, the pinch-hold overlay (thumbnail clone) must remain visible
//   until BOTH conditions are met:
//     1. The full image has finished loading (img.complete)
//     2. The pinch grace period (600ms) has elapsed (pinchActiveRef = false)
//
//   Key constraint the test must check: overlay is at opacity:1 on the FIRST
//   PAINT — no fade-in from 0. A `useState(false)` → `useEffect → setState(true)`
//   pattern would cause a 300ms 0→1 fade that is indistinguishable from the
//   black flash we're fixing. We verify by reading getComputedStyle().opacity
//   within one rAF of the click that triggers open().
//
//   Strategy: drive through window.__bulkaTest hook (same pattern as
//   gallery-lightbox-fixes.spec.ts). We simulate the pinch state by calling
//   setPendingZoom(>1) and setPinchActive(true). On localhost, images are
//   browser-cached so img.complete=true immediately — the AND-gate must still
//   hold because pinchActive is true.

async function waitForGalleryReady(page: Page) {
  await page
    .locator('[data-photo-strip][data-touch-mode="true"]')
    .first()
    .waitFor({ state: "attached", timeout: 15_000 });
  await page.waitForFunction(
    () =>
      typeof (window as unknown as Record<string, unknown>).__bulkaTest ===
      "object",
    { timeout: 5_000 },
  );
}

async function tapFirstPhoto(page: Page) {
  const clicked = await page.evaluate((selector) => {
    const btn = document.querySelector(selector);
    if (!(btn instanceof HTMLElement)) return false;
    btn.click();
    return true;
  }, FIRST_STRIP_BUTTON);
  expect(clicked, "no photo button found").toBe(true);
}

async function installColdPortraitRoute(page: Page) {
  await page.route(/\/images\/photo-set\/thumbs\/ps_portrait\.webp$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: portraitFixtureSvg,
    }),
  );
  await page.route(/\/images\/photo-set\/ps_portrait\.webp$/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    await route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: portraitFixtureSvg,
    });
  });
}

// Read computed opacity of the overlay at the current moment.
async function getOverlayOpacity(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const el = document.querySelector(
      '[data-testid="pinch-thumb-overlay"]',
    ) as HTMLElement | null;
    if (!el) return null;
    return parseFloat(window.getComputedStyle(el).opacity);
  });
}

// Check whether the pinch-hold overlay is visible right now.
async function isPinchOverlayVisible(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const el = document.querySelector(
      '[data-testid="pinch-thumb-overlay"]',
    ) as HTMLElement | null;
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.opacity !== "0" && style.visibility !== "hidden";
  });
}

test.describe("Pinch thumb overlay persists until full image loads", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?touch=1", { waitUntil: "load" });
    await waitForGalleryReady(page);
  });

  // Regression: overlay must be at opacity:1 on the FIRST PAINT after open,
  // not fade-in from 0. This is the root cause of the black flash on iPhone.
  // We check computed opacity within one rAF of the click.
  test("overlay is at opacity:1 on first paint (no fade-in black flash)", async ({
    page,
  }) => {
    // Set up the pinch state so open() captures pinchThumbSrc.
    await page.evaluate(() => {
      const t = (window as unknown as Record<string, unknown>).__bulkaTest as
        | {
            setPendingZoom: (n: number) => void;
            setPinchActive: (b: boolean) => void;
            setHoldPinchOverlay: (b: boolean) => void;
          }
        | undefined;
      if (!t) throw new Error("__bulkaTest hook not present");
      t.setPendingZoom(2.5);
      t.setPinchActive(true);
      // Hold the overlay so the poll doesn't dismiss it before we can read opacity.
      t.setHoldPinchOverlay(true);
    });

    // Open the lightbox (simulates commit from pinch release).
    await tapFirstPhoto(page);

    // Wait for lightbox portal to appear.
    await page.locator(".yarl__portal").waitFor({ state: "attached", timeout: 5_000 });

    // Read computed opacity within one rAF — this is the critical check.
    // If overlay used useState(false)+useEffect to show itself, we'd see
    // opacity < 1 here because the useEffect fires AFTER paint.
    const opacityOnMount = await page.evaluate((): Promise<number | null> => {
      return new Promise((resolve) => {
        requestAnimationFrame(() => {
          const el = document.querySelector(
            '[data-testid="pinch-thumb-overlay"]',
          ) as HTMLElement | null;
          if (!el) { resolve(null); return; }
          resolve(parseFloat(window.getComputedStyle(el).opacity));
        });
      });
    });

    expect(
      opacityOnMount,
      "pinch-thumb-overlay must be in DOM on first rAF after lightbox mounts",
    ).not.toBeNull();
    expect(
      opacityOnMount,
      "Overlay must be at opacity:1 on first paint — no fade-in from 0",
    ).toBe(1);
  });

  // Core behaviour: overlay stays visible while pinchActive=true, even if
  // the image is already browser-cached (img.complete=true immediately).
  // This directly tests the AND-gate: overlay hides only when BOTH
  // imageLoaded AND !pinchActive.
  test("overlay stays visible while pinchActive=true (cached image case)", async ({
    page,
  }) => {
    // Set up the pinch state: scale > 1 triggers the hold-overlay path,
    // and pinchActive=true keeps the AND-gate from dismissing it.
    await page.evaluate(() => {
      const t = (window as unknown as Record<string, unknown>).__bulkaTest as
        | {
            setPendingZoom: (n: number) => void;
            setPinchActive: (b: boolean) => void;
            setHoldPinchOverlay: (b: boolean) => void;
          }
        | undefined;
      if (!t) throw new Error("__bulkaTest hook not present");
      t.setPendingZoom(2.5);
      t.setPinchActive(true);
      // Do NOT hold the overlay via test hook here — we want the real poll
      // to run, held only by pinchActive=true (the production AND-gate).
    });

    // Open the lightbox (simulates finger release → commit → open).
    await tapFirstPhoto(page);

    // Wait for lightbox portal to appear.
    await page.locator(".yarl__portal").waitFor({ state: "attached", timeout: 5_000 });

    // The overlay must be visible immediately — pinchActive still true.
    const visibleAtMount = await isPinchOverlayVisible(page);
    expect(
      visibleAtMount,
      "Overlay must be visible right after lightbox mounts (pinch still active)",
    ).toBe(true);

    // After 300ms the overlay must still be visible — pinchActive still true.
    await page.waitForTimeout(300);
    const visibleAt300 = await isPinchOverlayVisible(page);
    expect(
      visibleAt300,
      "Overlay must still be visible at 300ms (pinch grace has not elapsed)",
    ).toBe(true);

    // Release the pinch grace — simulates the 600ms timer firing.
    await page.evaluate(() => {
      const t = (window as unknown as Record<string, unknown>).__bulkaTest as
        | { setPinchActive: (b: boolean) => void }
        | undefined;
      if (!t) throw new Error("__bulkaTest hook not present");
      t.setPinchActive(false);
    });

    // Give the rAF poll a few frames to detect the release and call setState,
    // plus the 300ms fade-out transition to complete.
    await page.waitForTimeout(500);

    const visibleAfterRelease = await isPinchOverlayVisible(page);
    expect(
      visibleAfterRelease,
      "Overlay must be hidden after pinch grace is released",
    ).toBe(false);
  });

  // Regression guard: a normal tap (no pinch) must NOT show the overlay at all.
  test("no pinch seed → overlay not present after lightbox opens", async ({
    page,
  }) => {
    // No setPendingZoom call — pendingZoom stays at 1 → pinchThumbSrc = null.
    await tapFirstPhoto(page);
    await page.locator(".yarl__portal").waitFor({ state: "attached", timeout: 5_000 });
    await page.waitForTimeout(300);

    const overlayVisible = await isPinchOverlayVisible(page);
    expect(
      overlayVisible,
      "Overlay should not be present for a normal tap-to-open (no pinch seed)",
    ).toBe(false);
  });

  // ── Timing regression: pixel-based zoom path must dismiss overlay in <2s ──
  //
  // Root cause of the bug this guards:
  //   In the PIXEL-BASED path (thumbWidth > 0), pendingZoomRef holds CSS pixels
  //   (e.g. 480 = 192px thumb × 2.5× scale), NOT a yarl scale factor.
  //   The old zoomPainted check compared this CSS-px value directly as a yarl
  //   scale: "2.5 >= 480 * 0.9" → always false → overlay waited full MAX_FRAMES
  //   (300 frames ≈ 5s) before dismissing on every pinch-open.
  //
  //   Fix: detect pixel-based path (thumbW > 0), divide by fitWidth to get true
  //   targetYarlZoom, then compare against zoomRef.current.zoom (actual yarl state).
  //
  //   The test would time out after 2s with the broken code (5s freeze),
  //   and passes quickly with the fix (dismiss happens after 600ms grace + rAF).
  test("pixel-based zoom path: overlay dismisses within 2s (not 5s freeze)", async ({
    page,
  }) => {
    // Pixel-based path: setThumbWidth(192) + setPendingZoom(480) = 192px thumb at 2.5×.
    // Real pinch sets pendingZoomRef = thumbWidthPx * clampedScale (CSS pixels).
    await page.evaluate(() => {
      const t = (window as unknown as Record<string, unknown>).__bulkaTest as
        | {
            setPendingZoom: (n: number) => void;
            setThumbWidth: (n: number) => void;
            setPinchActive: (b: boolean) => void;
          }
        | undefined;
      if (!t) throw new Error("__bulkaTest hook not present");
      t.setThumbWidth(192);
      t.setPendingZoom(480); // 192px × 2.5 scale = 480 CSS pixels
      t.setPinchActive(true);
      // Release pinch after 600ms — mirrors the real gesture grace window.
      window.setTimeout(() => t.setPinchActive(false), 600);
    });

    await tapFirstPhoto(page);
    await page.locator(".yarl__portal").waitFor({ state: "attached", timeout: 5_000 });

    // Overlay must appear (pixel-based path with zoom>1 → pinchThumbSrc set).
    await page.locator('[data-testid="pinch-thumb-overlay"]').waitFor({
      state: "attached",
      timeout: 1_000,
    });

    // Within 2s: overlay must transition to opacity:0.
    // Breakdown of expected timeline:
    //   600ms — pinch grace ends (setTimeout above)
    //   ~50ms — rAF poll detects all three conditions met (loaded + grace + zoom)
    //   300ms — CSS fade-out transition
    //   Total: ~950ms, well within 2s budget.
    //
    // BEFORE FIX: would time out here (overlay stays until MAX_FRAMES ≈ 5s).
    // AFTER FIX:  passes in ~1s.
    await page.waitForFunction(
      () => {
        const el = document.querySelector(
          '[data-testid="pinch-thumb-overlay"]',
        ) as HTMLElement | null;
        if (!el) return true; // removed from DOM = also dismissed
        // React sets inline style.opacity="0" when pinchHoldDismissing fires,
        // before the CSS transition completes — so this is an immediate signal.
        return el.style.opacity === "0";
      },
      { timeout: 2_000 },
    );
  });
});

test.describe("Pinch thumb overlay on cold full-size image", () => {
  test.beforeEach(async ({ page }) => {
    await installColdPortraitRoute(page);
    await page.goto("/?touch=1", { waitUntil: "load" });
    await waitForGalleryReady(page);
  });

  test("lightbox opens immediately, shows stretched thumb fallback, and can close before full image loads", async ({
    page,
  }) => {
    await page.evaluate((selector) => {
      const t = (window as unknown as Record<string, unknown>).__bulkaTest as
        | {
            beginPinchHandoff: (
              selector: string,
              opts: { scale: number; dx?: number; dy?: number },
            ) => void;
            commitPinchHandoff: (selector: string) => void;
          }
        | undefined;
      if (!t) throw new Error("__bulkaTest hook not present");
      t.beginPinchHandoff(selector, { scale: 2, dx: 0, dy: 0 });
      t.commitPinchHandoff(selector);
    }, FIRST_STRIP_BUTTON);

    await page
      .locator(".yarl__portal")
      .waitFor({ state: "attached", timeout: 1_000 });
    const thumbFallback = page.locator('[data-testid="pinch-thumb-overlay"]');
    await thumbFallback.waitFor({ state: "attached", timeout: 1_500 });
    await expect(thumbFallback).toHaveCSS("opacity", "1");
    await page
      .locator('[data-testid="pinch-transition-overlay"]')
      .waitFor({ state: "detached", timeout: 2_000 });

    await page.locator('button[title="Close"]').click({ force: true });
    await page
      .locator(".yarl__portal")
      .waitFor({ state: "detached", timeout: 2_000 });
  });
});
