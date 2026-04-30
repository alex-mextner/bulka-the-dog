import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

// Regression guard: the yarl lightbox portal fills the entire physical screen
// including iOS safe-area zones (notch / Dynamic Island top, home indicator
// bottom).  viewport-fit=cover is set in index.html, which lets the browser
// extend content behind those zones.  The portal must have position:fixed with
// inset:0 and zero padding so the image can reach all four edges when zoomed.
//
// Note on safe-area emulation: Chromium DevTools emulation always returns 0 for
// env(safe-area-inset-*), so we cannot test the actual device-level coverage
// here.  What we *can* verify:
//   1. Portal geometry: getBoundingClientRect() fills the visual viewport exactly.
//   2. No safe-area padding on container that would shrink the zoomed image.
//   3. At zoom 3x the image element covers >= the viewport height/width.

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
      | {
          setPendingZoom: (n: number) => void;
          setPinchActive: (b: boolean) => void;
        }
      | undefined;
    if (!t) throw new Error("__bulkaTest hook not present");
    t.setPendingZoom(v);
    t.setPinchActive(true);
    window.setTimeout(() => t.setPinchActive(false), 600);
  }, scale);
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

test.describe("Lightbox fullscreen coverage", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?touch=1", { waitUntil: "load" });
    await waitForGalleryReady(page);
  });

  // ── Portal fills the entire visual viewport ──────────────────────────────────
  //
  // .yarl__portal must have position:fixed; top:0; left:0; right:0; bottom:0
  // so that on iOS with viewport-fit=cover it extends behind the notch and
  // home indicator.  Any margin or inset offset would leave a strip of page
  // background visible.
  test("yarl portal fills the full visual viewport (top=0, bottom>=viewportHeight)", async ({
    page,
  }) => {
    await tapFirstPhoto(page);
    await page
      .locator(".yarl__portal")
      .waitFor({ state: "attached", timeout: 5_000 });
    await page.waitForTimeout(200);

    const result = await page.evaluate(() => {
      const portal = document.querySelector(
        ".yarl__portal",
      ) as HTMLElement | null;
      if (!portal) return null;
      const rect = portal.getBoundingClientRect();
      const style = window.getComputedStyle(portal);
      return {
        rect: {
          top: rect.top,
          left: rect.left,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        },
        position: style.position,
        paddingTop: style.paddingTop,
        paddingBottom: style.paddingBottom,
        paddingLeft: style.paddingLeft,
        paddingRight: style.paddingRight,
      };
    });

    expect(result, "portal element not found").not.toBeNull();
    expect(result!.position, "portal must be position:fixed").toBe("fixed");
    expect(result!.rect.top, "portal top must be 0").toBe(0);
    expect(result!.rect.left, "portal left must be 0").toBe(0);
    expect(result!.rect.right, "portal right must equal viewport width").toBe(
      390,
    );
    // bottom should match visual viewport height (844 for iPhone 13 viewport)
    expect(
      result!.rect.bottom,
      "portal bottom must reach viewport height",
    ).toBeGreaterThanOrEqual(844);
    expect(result!.paddingTop, "portal must have no top padding").toBe("0px");
    expect(result!.paddingBottom, "portal must have no bottom padding").toBe(
      "0px",
    );
  });

  // ── Container has no safe-area padding ───────────────────────────────────────
  //
  // The .yarl__container sits inside the portal. If yarl or any CSS override
  // added padding-top/bottom from env(safe-area-inset-*) the image bounding
  // box would shrink away from the screen edges, leaving black strips.
  // Gallery.tsx explicitly sets paddingTop/Bottom/Left/Right:0 via styles prop.
  test("yarl container has zero padding (no safe-area inset applied)", async ({
    page,
  }) => {
    await tapFirstPhoto(page);
    await page
      .locator(".yarl__container")
      .waitFor({ state: "attached", timeout: 5_000 });
    await page.waitForTimeout(200);

    const padding = await page.evaluate(() => {
      const container = document.querySelector(
        ".yarl__container",
      ) as HTMLElement | null;
      if (!container) return null;
      const style = window.getComputedStyle(container);
      return {
        top: style.paddingTop,
        bottom: style.paddingBottom,
        left: style.paddingLeft,
        right: style.paddingRight,
      };
    });

    expect(padding, "container element not found").not.toBeNull();
    expect(padding!.top, "container must have no top padding").toBe("0px");
    expect(padding!.bottom, "container must have no bottom padding").toBe(
      "0px",
    );
    expect(padding!.left, "container must have no left padding").toBe("0px");
    expect(padding!.right, "container must have no right padding").toBe("0px");
  });

  // ── At zoom 3x the image covers the entire viewport ──────────────────────────
  //
  // When the seed zoom is 3.0, the visible image area should be large enough
  // to cover the full viewport height and width.  We read the bounding rect
  // of the fullsize element after the seed-zoom poll has had time to fire (800ms).
  // At zoom 3x a portrait photo (taller than wide) will overflow the viewport
  // on both axes; a landscape photo will at least overflow horizontally.
  // We require height >= viewportHeight and width >= viewportWidth.
  test("at zoom 3x the slide image covers the full viewport", async ({
    page,
  }) => {
    await setSeedZoom(page, 3.0);
    await tapFirstPhoto(page);
    await page.locator(".yarl__slide_current .yarl__fullsize").waitFor({
      state: "attached",
      timeout: 5_000,
    });
    // Wait for seed-zoom rAF poll to apply the scale.
    await page.waitForTimeout(800);

    const result = await page.evaluate(() => {
      const fullsize = document.querySelector(
        ".yarl__slide_current .yarl__fullsize",
      ) as HTMLElement | null;
      const img = document.querySelector(
        ".yarl__slide_current .yarl__slide_image",
      ) as HTMLElement | null;
      const target = fullsize ?? img;
      if (!target) return null;
      const rect = target.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        vw: window.innerWidth,
        vh: window.innerHeight,
      };
    });

    expect(result, "slide fullsize/image element not found").not.toBeNull();
    expect(
      result!.width,
      `at zoom 3x image width ${result!.width} should cover viewport width ${result!.vw}`,
    ).toBeGreaterThanOrEqual(result!.vw);
    expect(
      result!.height,
      `at zoom 3x image height ${result!.height} should cover viewport height ${result!.vh}`,
    ).toBeGreaterThanOrEqual(result!.vh);
  });

  test("tap-open image is full-bleed, with no contain letterbox strips", async ({
    page,
  }) => {
    await tapFirstPhoto(page);
    await page
      .locator(".yarl__slide_current .yarl__slide_image")
      .waitFor({ state: "attached", timeout: 5_000 });
    await page.waitForTimeout(300);

    const result = await page.evaluate(() => {
      const img = document.querySelector(
        ".yarl__slide_current .yarl__slide_image",
      ) as HTMLImageElement | null;
      if (!img) return null;
      const rect = img.getBoundingClientRect();
      const style = window.getComputedStyle(img);
      return {
        rect: {
          top: rect.top,
          left: rect.left,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        },
        objectFit: style.objectFit,
        vw: window.innerWidth,
        vh: window.innerHeight,
      };
    });

    expect(result, "slide image element not found").not.toBeNull();
    expect(result!.objectFit).toBe("cover");
    expect(result!.rect.left).toBeLessThanOrEqual(1);
    expect(result!.rect.top).toBeLessThanOrEqual(1);
    expect(result!.rect.right).toBeGreaterThanOrEqual(result!.vw - 1);
    expect(result!.rect.bottom).toBeGreaterThanOrEqual(result!.vh - 1);
  });

  test("portal uses one fullscreen viewport height and keeps controls in safe areas", async ({
    page,
  }) => {
    await page.evaluate(() => {
      document.documentElement.style.setProperty("--safe-area-top", "59px");
      document.documentElement.style.setProperty("--safe-area-bottom", "34px");
      document.documentElement.style.setProperty(
        "--bulka-viewport-height",
        "900px",
      );
      document.documentElement.style.setProperty(
        "--bulka-viewport-bottom-inset",
        "120px",
      );
    });

    await tapFirstPhoto(page);
    await page
      .locator(".bulka-lightbox.yarl__portal")
      .waitFor({ state: "attached", timeout: 5_000 });
    await page.waitForTimeout(200);

    const result = await page.evaluate(() => {
      const portal = document.querySelector(
        ".bulka-lightbox.yarl__portal",
      ) as HTMLElement | null;
      const toolbar = document.querySelector(
        ".bulka-lightbox .yarl__toolbar",
      ) as HTMLElement | null;
      const captions = document.querySelector(
        ".bulka-lightbox .yarl__slide_captions_container",
      ) as HTMLElement | null;
      if (!portal || !toolbar || !captions) return null;
      const rect = portal.getBoundingClientRect();
      return {
        rect: { top: rect.top, bottom: rect.bottom, height: rect.height },
        portalHeight: window.getComputedStyle(portal).height,
        toolbarPaddingTop: window.getComputedStyle(toolbar).paddingTop,
        captionsPaddingBottom: window.getComputedStyle(captions).paddingBottom,
        vh: window.innerHeight,
      };
    });

    expect(result, "lightbox safe-area elements not found").not.toBeNull();
    expect(result!.rect.top).toBe(0);
    expect(result!.rect.bottom).toBe(900);
    expect(result!.rect.height).toBe(900);
    expect(result!.portalHeight).toBe("900px");
    expect(result!.toolbarPaddingTop).toBe("126px");
    expect(result!.captionsPaddingBottom).toBe("136px");
  });

  test("black backdrop shares the lightbox viewport height", async ({
    page,
  }) => {
    await page.evaluate(() => {
      document.documentElement.style.setProperty(
        "--bulka-viewport-height",
        "900px",
      );
    });

    await tapFirstPhoto(page);
    await page
      .locator(".bulka-lightbox-backdrop")
      .waitFor({ state: "attached", timeout: 5_000 });
    await page.waitForTimeout(200);

    const result = await page.evaluate(() => {
      const backdrop = document.querySelector(
        ".bulka-lightbox-backdrop",
      ) as HTMLElement | null;
      if (!backdrop) return null;
      const rect = backdrop.getBoundingClientRect();
      return {
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
        vh: window.innerHeight,
      };
    });

    expect(result, "lightbox backdrop not found").not.toBeNull();
    expect(result!.top).toBe(0);
    expect(result!.bottom).toBe(900);
    expect(result!.height).toBe(900);
  });
});
