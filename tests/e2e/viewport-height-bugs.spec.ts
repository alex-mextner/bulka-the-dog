import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

// Tests for two iOS height bugs. Both bugs are iOS Safari-specific and cannot
// be reproduced in Chromium DevTools emulation (no address-bar, no large/small
// viewport split, env(safe-area-inset-*) always 0). So instead of testing
// observable geometry, we test that the structural CSS fix is *present* in the
// rendered page. These tests are RED until the fix is applied.
//
// Bug 1: Lightbox doesn't fill the full physical screen height.
//   .yarl__portal uses position:fixed; inset:0 but no explicit height. On iOS
//   Safari with a visible address bar, the visual viewport is shorter than 100vh
//   and fixed elements sized only by inset may not fully cover it. Fix: add
//   `height: 100dvh` to .yarl__portal (and container) via Gallery.tsx styles prop.
//
// Bug 2: White strip at the bottom of the page in Safari.
//   `100vh` resolves to "large viewport" height (address-bar-included). When the
//   address bar is visible the visual viewport is shorter, so page content falls
//   short and the <body> background (not even html background) doesn't fill the
//   visual bottom. Fix: `body { min-height: 100dvh }` in global.css.

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

test.describe("Bug 1: Lightbox portal explicit height (iOS address-bar fix)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?touch=1", { waitUntil: "load" });
    await waitForGalleryReady(page);
  });

  // Without an explicit height on .yarl__portal, iOS Safari may render the
  // fixed-positioned portal short of the full visual viewport when the address
  // bar is shown. The fix is `height: 100dvh` in global.css on `.yarl__portal`.
  // We verify by checking computed height equals window.innerHeight
  // (100dvh = current visual viewport height in Chromium DevTools emulation).
  test("yarl portal has an explicit height set (not auto) — CSS fix present", async ({
    page,
  }) => {
    await tapFirstPhoto(page);
    await page.locator(".yarl__portal").waitFor({ state: "attached", timeout: 5_000 });
    await page.waitForTimeout(200);

    const result = await page.evaluate(() => {
      const portal = document.querySelector(".yarl__portal") as HTMLElement | null;
      if (!portal) return null;
      const computedHeight = window.getComputedStyle(portal).height;
      const computedHeightPx = parseFloat(computedHeight);
      return { computedHeight, computedHeightPx, innerHeight: window.innerHeight };
    });

    expect(result, "portal element not found").not.toBeNull();

    // The fix sets height: 100dvh via global.css. Computed height must equal
    // window.innerHeight (in Chromium DevTools emulation 100dvh === innerHeight).
    expect(
      result!.computedHeightPx,
      `portal computed height (${result!.computedHeight}) must equal viewport height (${result!.innerHeight}px) — fix not applied`,
    ).toBe(result!.innerHeight);
  });

  // Regression guard: container (position:absolute inside portal) has zero padding.
  // No explicit height needed on container — it stretches via inset:0 inside the
  // portal which already has height:100dvh. Adding height:100dvh to an absolute
  // element that also has top:0/bottom:0 can break yarl's internal layout.
  test("yarl container retains zero padding after portal height fix", async ({
    page,
  }) => {
    await tapFirstPhoto(page);
    await page.locator(".yarl__container").waitFor({ state: "attached", timeout: 5_000 });
    await page.waitForTimeout(200);

    const result = await page.evaluate(() => {
      const container = document.querySelector(
        ".yarl__container",
      ) as HTMLElement | null;
      if (!container) return null;
      const style = window.getComputedStyle(container);
      return {
        paddingTop: style.paddingTop,
        paddingBottom: style.paddingBottom,
      };
    });

    expect(result, "container element not found").not.toBeNull();
    expect(result!.paddingTop, "container must have no top padding").toBe("0px");
    expect(result!.paddingBottom, "container must have no bottom padding").toBe("0px");
  });
});

test.describe("Bug 2: Body min-height for Safari white strip fix", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });
  });

  // html already has min-height: 100dvh (global.css line 129). Body does not.
  // Without min-height on body, the body background can fall short of the
  // visual viewport bottom when the Safari address bar is visible.
  // After fix: body computed min-height >= window.innerHeight.
  test("body min-height is set to at least viewport height (100dvh fix present)", async ({
    page,
  }) => {
    const result = await page.evaluate(() => {
      const body = document.body;
      const style = window.getComputedStyle(body);
      return {
        minHeight: style.minHeight,
        minHeightPx: parseFloat(style.minHeight),
        innerHeight: window.innerHeight,
      };
    });

    // Before fix: body has no min-height → computed is "0px" or "auto"
    // After fix: body min-height: 100dvh → resolves to px equal to innerHeight
    expect(
      result.minHeightPx,
      `body min-height (${result.minHeight}) must be >= viewport height (${result.innerHeight}px) — '${result.minHeight}' is too short, white strip will appear in Safari`,
    ).toBeGreaterThanOrEqual(result.innerHeight);
  });

  // html already has the fix — regression guard so we don't accidentally remove it.
  test("html min-height is set to at least viewport height (existing fix regression guard)", async ({
    page,
  }) => {
    const result = await page.evaluate(() => {
      const html = document.documentElement;
      const style = window.getComputedStyle(html);
      return {
        minHeightPx: parseFloat(style.minHeight),
        innerHeight: window.innerHeight,
      };
    });

    expect(
      result.minHeightPx,
      `html min-height (${result.minHeightPx}px) must be >= viewport height (${result.innerHeight}px)`,
    ).toBeGreaterThanOrEqual(result.innerHeight);
  });
});
