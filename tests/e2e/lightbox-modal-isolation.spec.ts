import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

// Regression guard: when the lightbox is open, page content inside #root must
// not be visible through Safari's top/bottom chrome compositing pass.
// Strategy: CSS body.yarl__no_scroll #root { visibility: hidden }
// so the page canvas is not rendered while the modal is active.
//
// yarl adds/removes yarl__no_scroll on body automatically on open/close.

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

test.describe("Lightbox modal isolation (Task 2)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?touch=1", { waitUntil: "load" });
    await waitForGalleryReady(page);
  });

  test("opening the lightbox applies yarl__no_scroll and hides #root", async ({
    page,
  }) => {
    await tapFirstPhoto(page);
    await page
      .locator(".yarl__portal")
      .waitFor({ state: "attached", timeout: 5_000 });
    await page.waitForTimeout(100);

    const result = await page.evaluate(() => {
      const root = document.getElementById("root");
      return {
        bodyHasNoScroll: document.body.classList.contains("yarl__no_scroll"),
        rootVisibility: root
          ? window.getComputedStyle(root).visibility
          : null,
        bodyBg: window.getComputedStyle(document.body).backgroundColor,
      };
    });

    expect(
      result.bodyHasNoScroll,
      "body must have yarl__no_scroll class while lightbox is open",
    ).toBe(true);
    expect(
      result.rootVisibility,
      "#root visibility must be 'hidden' while lightbox is open",
    ).toBe("hidden");
    // body background must be black so no page canvas bleeds through chrome
    expect(
      result.bodyBg,
      "body background must be black while lightbox is open",
    ).toBe("rgb(0, 0, 0)");
  });

  test("closing the lightbox removes yarl__no_scroll and restores #root visibility", async ({
    page,
  }) => {
    await tapFirstPhoto(page);
    await page
      .locator(".yarl__portal")
      .waitFor({ state: "attached", timeout: 5_000 });
    await page.waitForTimeout(100);

    // Close via Escape
    await page.keyboard.press("Escape");
    await page
      .locator(".yarl__portal")
      .waitFor({ state: "detached", timeout: 5_000 });
    await page.waitForTimeout(100);

    const result = await page.evaluate(() => {
      const root = document.getElementById("root");
      return {
        bodyHasNoScroll: document.body.classList.contains("yarl__no_scroll"),
        rootVisibility: root
          ? window.getComputedStyle(root).visibility
          : null,
      };
    });

    expect(
      result.bodyHasNoScroll,
      "body must NOT have yarl__no_scroll after lightbox closes",
    ).toBe(false);
    expect(
      result.rootVisibility,
      "#root visibility must be restored to 'visible' after lightbox closes",
    ).toBe("visible");
  });

  test("lightbox portal and backdrop remain visible while #root is hidden", async ({
    page,
  }) => {
    await tapFirstPhoto(page);
    await page
      .locator(".yarl__portal")
      .waitFor({ state: "attached", timeout: 5_000 });
    await page.waitForTimeout(100);

    const result = await page.evaluate(() => {
      const portal = document.querySelector(".yarl__portal") as HTMLElement | null;
      const backdrop = document.querySelector(
        ".bulka-lightbox-backdrop",
      ) as HTMLElement | null;
      const root = document.getElementById("root");
      return {
        rootVisibility: root
          ? window.getComputedStyle(root).visibility
          : null,
        portalVisibility: portal
          ? window.getComputedStyle(portal).visibility
          : null,
        backdropVisibility: backdrop
          ? window.getComputedStyle(backdrop).visibility
          : null,
        // Verify portal and backdrop are in body, not #root
        portalInBody: portal ? document.body.contains(portal) : false,
        portalInRoot: portal
          ? (document.getElementById("root")?.contains(portal) ?? false)
          : false,
      };
    });

    expect(result.rootVisibility, "#root must be hidden").toBe("hidden");
    expect(result.portalVisibility, "portal must remain visible").toBe(
      "visible",
    );
    expect(result.backdropVisibility, "backdrop must remain visible").toBe(
      "visible",
    );
    expect(result.portalInBody, "portal must be in document.body").toBe(true);
    expect(result.portalInRoot, "portal must NOT be inside #root").toBe(false);
  });

  // Scroll position regression: closing the lightbox must not jump the page.
  // yarl's overflow:hidden on body can shift content on some browsers.
  test("scroll position is preserved after lightbox open/close cycle", async ({
    page,
  }) => {
    // Scroll down a bit so we have a non-zero scroll position to test with
    await page.evaluate(() => window.scrollTo(0, 200));
    await page.waitForTimeout(100);
    const scrollBefore = await page.evaluate(() => window.scrollY);

    await tapFirstPhoto(page);
    await page
      .locator(".yarl__portal")
      .waitFor({ state: "attached", timeout: 5_000 });
    await page.waitForTimeout(100);

    await page.keyboard.press("Escape");
    await page
      .locator(".yarl__portal")
      .waitFor({ state: "detached", timeout: 5_000 });
    await page.waitForTimeout(100);

    const scrollAfter = await page.evaluate(() => window.scrollY);
    expect(
      Math.abs(scrollAfter - scrollBefore),
      `scroll position should not change after lightbox close (was ${scrollBefore}, got ${scrollAfter})`,
    ).toBeLessThanOrEqual(2);
  });
});
