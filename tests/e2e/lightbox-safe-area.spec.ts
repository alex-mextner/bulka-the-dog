import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

// Tests that the lightbox fully covers the viewport including iOS safe-area
// zones (notch / Dynamic Island on top, home-indicator strip on bottom).
//
// Strategy (Task 2): canvas isolation via body.yarl__no_scroll.
//   - body + html backgrounds become #000 when lightbox is open
//   - #root visibility is set to hidden (removes it from paint tree)
//   - portal + backdrop remain visible (mounted in body, not #root)
// The "paint coverage" invariant is that no page canvas bleeds through
// Safari's top/bottom chrome compositing while the modal is active.

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

  // Task 2 strategy: canvas isolation via body.yarl__no_scroll.
  // When the lightbox is open, body and html backgrounds become black so that
  // any Safari chrome compositing bleed shows as black (matching the modal),
  // not as cream page content. This test verifies the canvas isolation is
  // applied on open and fully restored on close.
  test("opening lightbox activates canvas isolation (body/html become black)", async ({
    page,
  }) => {
    const bgBefore = await page.evaluate(() => ({
      html: window.getComputedStyle(document.documentElement).backgroundColor,
      body: window.getComputedStyle(document.body).backgroundColor,
    }));
    expect(bgBefore.html).not.toBe("rgb(0, 0, 0)");
    expect(bgBefore.body).not.toBe("rgb(0, 0, 0)");

    await tapFirstPhoto(page);
    await page
      .locator(".yarl__portal")
      .waitFor({ state: "attached", timeout: 5_000 });
    await page.waitForTimeout(150);

    const bgOpen = await page.evaluate(() => ({
      html: window.getComputedStyle(document.documentElement).backgroundColor,
      body: window.getComputedStyle(document.body).backgroundColor,
    }));
    expect(
      bgOpen.html,
      "html background must be black while lightbox is open (canvas isolation)",
    ).toBe("rgb(0, 0, 0)");
    expect(
      bgOpen.body,
      "body background must be black while lightbox is open (canvas isolation)",
    ).toBe("rgb(0, 0, 0)");

    await page.keyboard.press("Escape");
    await page
      .locator(".yarl__portal")
      .waitFor({ state: "detached", timeout: 5_000 });
    await page.waitForTimeout(150);

    const bgAfter = await page.evaluate(() => ({
      html: window.getComputedStyle(document.documentElement).backgroundColor,
      body: window.getComputedStyle(document.body).backgroundColor,
    }));
    expect(
      bgAfter.html,
      "html background must be restored after lightbox closes",
    ).toBe(bgBefore.html);
    expect(
      bgAfter.body,
      "body background must be restored after lightbox closes",
    ).toBe(bgBefore.body);
  });

  // ── .yarl__portal background is fully opaque ─────────────────────────────────
  //
  // A semi-transparent portal lets the cream page tint bleed through across
  // the entire photo. The portal and its inner container should both be fully
  // opaque black.
  test("yarl portal background is fully opaque black", async ({ page }) => {
    await tapFirstPhoto(page);
    await page
      .locator(".yarl__portal")
      .waitFor({ state: "attached", timeout: 5_000 });
    await page.waitForTimeout(150);

    const { portalBg, containerBg } = await page.evaluate(() => {
      const portal = document.querySelector(
        ".yarl__portal",
      ) as HTMLElement | null;
      const container = document.querySelector(
        ".yarl__container",
      ) as HTMLElement | null;
      return {
        portalBg: portal
          ? window.getComputedStyle(portal).backgroundColor
          : null,
        containerBg: container
          ? window.getComputedStyle(container).backgroundColor
          : null,
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
