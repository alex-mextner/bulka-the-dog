import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

// Test for pinch-to-open black-screen fix:
//   When user releases pinch fingers before the full-resolution image has
//   loaded, the PinchTransitionOverlay (thumbnail clone) must remain visible
//   until the full image finishes loading — preventing a black flash.
//
// Strategy: drive through window.__bulkaTest hook (same pattern as
// gallery-lightbox-fixes.spec.ts). We can't intercept real network requests
// here but we CAN verify that the overlay element stays in the DOM and visible
// immediately after the lightbox portal mounts, before any 800ms wait.

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

async function setSeedZoom(page: Page, scale: number) {
  await page.evaluate((v) => {
    const t = (window as unknown as Record<string, unknown>).__bulkaTest as
      | { setPendingZoom: (n: number) => void; setPinchActive: (b: boolean) => void }
      | undefined;
    if (!t) throw new Error("__bulkaTest hook not present");
    t.setPendingZoom(v);
    t.setPinchActive(true);
    // Keep pinchActive true for 600ms (same as real gesture commit path).
    window.setTimeout(() => t.setPinchActive(false), 600);
  }, scale);
}

async function tapFirstPhoto(page: Page) {
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

// Check whether a pinch-loading overlay is visible in the DOM right now.
// We look for the fixed overlay that PinchTransitionOverlay renders — it
// has aria-hidden="true", position:fixed, z-index:9999, and contains the
// background-image div. We also accept a dedicated data-testid attribute
// that the implementation may choose to add.
async function isPinchOverlayVisible(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    // Primary: data-testid (implementation may add this)
    const byTestId = document.querySelector(
      '[data-testid="pinch-thumb-overlay"]',
    ) as HTMLElement | null;
    if (byTestId) {
      const style = window.getComputedStyle(byTestId);
      return style.display !== "none" && style.opacity !== "0" && style.visibility !== "hidden";
    }

    // Fallback: the portal div rendered by PinchTransitionOverlay has
    // aria-hidden="true", position:fixed, z-index:9999. Match it.
    const portals = Array.from(
      document.querySelectorAll<HTMLElement>('[aria-hidden="true"]'),
    ).filter((el) => {
      const s = window.getComputedStyle(el);
      return s.position === "fixed" && parseInt(s.zIndex, 10) >= 9999;
    });
    if (portals.length === 0) return false;
    const el = portals[0];
    const st = window.getComputedStyle(el);
    return st.display !== "none" && st.opacity !== "0" && st.visibility !== "hidden";
  });
}

test.describe("Pinch thumb overlay persists until full image loads", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?touch=1", { waitUntil: "load" });
    await waitForGalleryReady(page);
  });

  // After fingers are released (simulated via setSeedZoom + tap), the
  // thumbnail overlay must be visible immediately after the lightbox portal
  // appears. We use the test-hook holdPinchOverlay to prevent auto-dismiss
  // on browser-cached images (where img.complete fires before we can check).
  test("overlay stays visible right after lightbox opens (before full img loads)", async ({
    page,
  }) => {
    // Tell the polling loop not to auto-dismiss the overlay — simulates the
    // real case where the full image is still loading (not yet in cache).
    await page.evaluate(() => {
      const t = (window as unknown as Record<string, unknown>).__bulkaTest as
        | { setHoldPinchOverlay: (v: boolean) => void }
        | undefined;
      if (!t) throw new Error("__bulkaTest hook not present");
      t.setHoldPinchOverlay(true);
    });

    // Simulate pinch-commit state: scale 2.5, pinchActive grace 600ms.
    await setSeedZoom(page, 2.5);

    // Open the lightbox (simulates finger release → commit → open).
    await tapFirstPhoto(page);

    // Wait for lightbox portal to appear.
    await page.locator(".yarl__portal").waitFor({ state: "attached", timeout: 5_000 });

    // Immediately after portal mount — the thumbnail overlay should be visible.
    const overlayVisibleImmediately = await isPinchOverlayVisible(page);
    expect(
      overlayVisibleImmediately,
      "PinchTransitionOverlay should still be visible right after lightbox opens (full img not yet loaded)",
    ).toBe(true);

    // Release the hold — simulates image finishing load.
    await page.evaluate(() => {
      const t = (window as unknown as Record<string, unknown>).__bulkaTest as
        | { setHoldPinchOverlay: (v: boolean) => void }
        | undefined;
      if (!t) throw new Error("__bulkaTest hook not present");
      t.setHoldPinchOverlay(false);
    });

    // Wait for poll to fire and overlay to fade + unmount (300ms fade + buffer).
    await page.waitForTimeout(600);

    const overlayVisibleAfterLoad = await isPinchOverlayVisible(page);
    expect(
      overlayVisibleAfterLoad,
      "PinchTransitionOverlay should be hidden after image load is released",
    ).toBe(false);
  });

  // Regression guard: a normal tap (no pinch) must NOT leave the overlay
  // hanging around.
  test("no pinch seed → overlay not present after lightbox opens", async ({
    page,
  }) => {
    // No setSeedZoom call — pendingZoom stays at 1.
    await tapFirstPhoto(page);
    await page.locator(".yarl__portal").waitFor({ state: "attached", timeout: 5_000 });
    await page.waitForTimeout(300);

    const overlayVisible = await isPinchOverlayVisible(page);
    expect(
      overlayVisible,
      "Overlay should not be present for a normal tap-to-open (no pinch seed)",
    ).toBe(false);
  });
});
