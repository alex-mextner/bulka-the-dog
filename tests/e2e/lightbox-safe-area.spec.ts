import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

// Tests that the lightbox fully covers the viewport including iOS safe-area
// zones (notch / Dynamic Island on top, home-indicator strip on bottom).
//
// Root cause: on iPhone with viewport-fit=cover the browser extends content
// behind the notch and home indicator. When the lightbox is open, any
// semi-transparent or missing background in those zones lets the page's cream
// background (--background: 30 25% 97%) bleed through, showing coloured bands.
//
// Fix required:
//   1. body background must be #000 while the lightbox is open (covers safe-area
//      zones regardless of where .yarl__portal sits in the paint order).
//   2. .yarl__portal background must be fully opaque (alpha = 1) so no
//      page content bleeds through even on devices where portal doesn't
//      extend to the absolute screen edge.

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
  const clicked = await page.evaluate(() => {
    const btn = document.querySelector(
      "[data-photo-strip] div.flex.flex-nowrap button",
    );
    if (!(btn instanceof HTMLElement)) return false;
    btn.click();
    return true;
  });
  expect(clicked, "no photo button found").toBe(true);
}

test.describe("Lightbox safe-area coverage", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?touch=1", { waitUntil: "load" });
    await waitForGalleryReady(page);
  });

  // ── body background turns black when lightbox opens ──────────────────────────
  //
  // .yarl__portal covers the visual viewport, but iOS safe-area zones are
  // painted on top of the <body> background. If body stays cream while the
  // lightbox is open, a thin strip of page colour is visible at top/bottom.
  // When lightbox closes, body should revert to its original background.
  test("body background is black while lightbox is open", async ({ page }) => {
    // Confirm body is NOT black before opening.
    const bgBefore = await page.evaluate(() =>
      window.getComputedStyle(document.body).backgroundColor,
    );
    expect(
      bgBefore,
      "body should not be black before lightbox opens",
    ).not.toBe("rgb(0, 0, 0)");

    await tapFirstPhoto(page);
    await page.locator(".yarl__portal").waitFor({ state: "attached", timeout: 5_000 });
    // Small settle so any JS-driven class/style change has time to apply.
    await page.waitForTimeout(150);

    const bgOpen = await page.evaluate(() =>
      window.getComputedStyle(document.body).backgroundColor,
    );

    // body must be opaque black while lightbox covers the screen.
    expect(
      bgOpen,
      `body should be rgb(0, 0, 0) while lightbox is open, got: ${bgOpen}`,
    ).toBe("rgb(0, 0, 0)");

    // ── after close: body returns to original ──
    await page.keyboard.press("Escape");
    await page.locator(".yarl__portal").waitFor({ state: "detached", timeout: 5_000 });
    await page.waitForTimeout(150);

    const bgAfter = await page.evaluate(() =>
      window.getComputedStyle(document.body).backgroundColor,
    );
    expect(
      bgAfter,
      "body should revert to page background after lightbox closes",
    ).not.toBe("rgb(0, 0, 0)");
  });

  // ── .yarl__portal background is fully opaque ─────────────────────────────────
  //
  // Even with a black body, a semi-transparent portal lets the cream page
  // tint bleed through across the entire photo. The portal and its inner
  // container should both be fully opaque black.
  test("yarl portal background is fully opaque black", async ({ page }) => {
    await tapFirstPhoto(page);
    await page.locator(".yarl__portal").waitFor({ state: "attached", timeout: 5_000 });
    await page.waitForTimeout(150);

    const { portalBg, containerBg } = await page.evaluate(() => {
      const portal = document.querySelector(".yarl__portal") as HTMLElement | null;
      const container = document.querySelector(".yarl__container") as HTMLElement | null;
      return {
        portalBg: portal ? window.getComputedStyle(portal).backgroundColor : null,
        containerBg: container ? window.getComputedStyle(container).backgroundColor : null,
      };
    });

    // Portal must be rgb(0, 0, 0) — fully opaque, no alpha channel.
    expect(portalBg, "yarl portal should have fully opaque black bg").toBe(
      "rgb(0, 0, 0)",
    );

    // Container (inner element with the actual slide content) also fully opaque.
    expect(
      containerBg,
      "yarl container should have fully opaque black bg",
    ).toBe("rgb(0, 0, 0)");
  });
});
