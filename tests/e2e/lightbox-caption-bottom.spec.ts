import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

// Task 4: Caption bottom placement and bottom chrome isolation.
//
// The bottom Safari address bar must not show page content, and the caption
// must stay readable above the bottom chrome. Two-part protection:
//
// 1. Canvas isolation (Task 2 impl): body.yarl__no_scroll makes body black and
//    hides #root so no page canvas bleeds through Safari's bottom compositing.
//
// 2. Caption placement: .yarl__slide_captions_container gets padding-bottom
//    from --bulka-viewport-bottom-inset so the caption sits above bottom chrome.
//
// CSS rule being tested:
//   padding-bottom: calc(
//     var(--yarl__slide_captions_container_padding, 16px) +
//     var(--bulka-viewport-bottom-inset, var(--safe-area-bottom, 0px))
//   ) !important;
//
// Expected: padding = 16px base + injected --bulka-viewport-bottom-inset value.

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

async function getCaptionsPaddingBottom(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.querySelector(
      ".yarl__slide_captions_container",
    ) as HTMLElement | null;
    if (!el) return -1;
    return parseFloat(window.getComputedStyle(el).paddingBottom);
  });
}

test.describe("Lightbox caption bottom placement (Task 4)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?touch=1", { waitUntil: "load" });
    await waitForGalleryReady(page);
  });

  // -- Home indicator simulation (compact bar visible, 34px inset) ----------
  test("caption padding-bottom is 16px base + 34px inset (home indicator)", async ({
    page,
  }) => {
    await page.evaluate(() => {
      document.documentElement.style.setProperty(
        "--bulka-viewport-bottom-inset",
        "34px",
      );
    });

    await tapFirstPhoto(page);
    await page
      .locator(".yarl__slide_captions_container")
      .first()
      .waitFor({ state: "attached", timeout: 5_000 });
    await page.waitForTimeout(150);

    const padding = await getCaptionsPaddingBottom(page);
    // 16px base + 34px = 50px
    expect(
      padding,
      `caption padding-bottom should be 50px (16 base + 34 inset), got ${padding}px`,
    ).toBe(50);
  });

  // -- Compact address bar simulation (large bottom chrome, 120px inset) ----
  test("caption padding-bottom is 16px base + 120px inset (compact address bar)", async ({
    page,
  }) => {
    await page.evaluate(() => {
      document.documentElement.style.setProperty(
        "--bulka-viewport-bottom-inset",
        "120px",
      );
    });

    await tapFirstPhoto(page);
    await page
      .locator(".yarl__slide_captions_container")
      .first()
      .waitFor({ state: "attached", timeout: 5_000 });
    await page.waitForTimeout(150);

    const padding = await getCaptionsPaddingBottom(page);
    // 16px base + 120px = 136px
    expect(
      padding,
      `caption padding-bottom should be 136px (16 base + 120 inset), got ${padding}px`,
    ).toBe(136);
  });

  // -- Address bar collapsed (0px inset, large viewport) --------------------
  test("caption padding-bottom is at least 16px base when inset is 0 (address bar collapsed)", async ({
    page,
  }) => {
    await page.evaluate(() => {
      document.documentElement.style.setProperty(
        "--bulka-viewport-bottom-inset",
        "0px",
      );
    });

    await tapFirstPhoto(page);
    await page
      .locator(".yarl__slide_captions_container")
      .first()
      .waitFor({ state: "attached", timeout: 5_000 });
    await page.waitForTimeout(150);

    const padding = await getCaptionsPaddingBottom(page);
    // CSS minimum: 16px base + 0px inset
    expect(
      padding,
      `caption padding-bottom must be at least 16px (base), got ${padding}px`,
    ).toBeGreaterThanOrEqual(16);
  });

  // -- After scroll: padding unaffected by prior scroll position ------------
  test("caption padding-bottom is correct after page scroll then lightbox open", async ({
    page,
  }) => {
    await page.evaluate(() => {
      document.documentElement.style.setProperty(
        "--bulka-viewport-bottom-inset",
        "34px",
      );
    });
    await page.evaluate(() =>
      window.scrollTo({ top: 500, behavior: "instant" }),
    );
    await page.waitForTimeout(100);

    await tapFirstPhoto(page);
    await page
      .locator(".yarl__slide_captions_container")
      .first()
      .waitFor({ state: "attached", timeout: 5_000 });
    await page.waitForTimeout(150);

    const padding = await getCaptionsPaddingBottom(page);
    expect(
      padding,
      `caption padding-bottom after scroll should be 50px (16 + 34), got ${padding}px`,
    ).toBe(50);
  });

  // -- After pinch-open: seed zoom must not affect caption padding ----------
  test("caption padding-bottom is correct after pinch-open with seed zoom", async ({
    page,
  }) => {
    await page.evaluate(() => {
      document.documentElement.style.setProperty(
        "--bulka-viewport-bottom-inset",
        "34px",
      );
      const t = (
        window as unknown as Record<string, unknown>
      ).__bulkaTest as
        | {
            setPendingZoom: (n: number) => void;
            setPinchActive: (b: boolean) => void;
          }
        | undefined;
      if (!t) throw new Error("__bulkaTest hook not present");
      t.setPendingZoom(2.5);
      t.setPinchActive(true);
      window.setTimeout(() => t.setPinchActive(false), 600);
    });

    await tapFirstPhoto(page);
    await page
      .locator(".yarl__slide_captions_container")
      .first()
      .waitFor({ state: "attached", timeout: 5_000 });
    // Wait for seed-zoom rAF to fire
    await page.waitForTimeout(800);

    const padding = await getCaptionsPaddingBottom(page);
    expect(
      padding,
      `caption padding-bottom after pinch-open should be 50px (16 + 34), got ${padding}px`,
    ).toBe(50);
  });

  // Canvas isolation (body.yarl__no_scroll → body black + #root hidden) is the
  // bottom chrome paint guard; caption padding positions the text above it.
  // Both are needed: isolation alone keeps page hidden, padding keeps text visible.
  // The isolation invariant itself is covered by lightbox-modal-isolation.spec.ts.
});
