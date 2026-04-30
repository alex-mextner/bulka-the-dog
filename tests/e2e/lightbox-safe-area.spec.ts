import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

// Tests that the lightbox fully covers the viewport including iOS safe-area
// zones (notch / Dynamic Island on top, home-indicator strip on bottom).
//
// The lightbox should cover the viewport with its own fullscreen layers. The
// page canvas must not be repainted black as a fallback; otherwise Safari can
// still show clipped page content through translucent browser chrome.

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

  test("opening lightbox does not repaint the page canvas as a fallback", async ({
    page,
  }) => {
    const bgBefore = await page.evaluate(() => ({
      html: window.getComputedStyle(document.documentElement).backgroundColor,
      body: window.getComputedStyle(document.body).backgroundColor,
      root: window.getComputedStyle(document.getElementById("root")!)
        .backgroundColor,
    }));
    await tapFirstPhoto(page);
    await page
      .locator(".yarl__portal")
      .waitFor({ state: "attached", timeout: 5_000 });
    await page.waitForTimeout(150);

    const bgOpen = await page.evaluate(() => ({
      html: window.getComputedStyle(document.documentElement).backgroundColor,
      body: window.getComputedStyle(document.body).backgroundColor,
      root: window.getComputedStyle(document.getElementById("root")!)
        .backgroundColor,
    }));

    expect(bgOpen.html).toBe(bgBefore.html);
    expect(bgOpen.body).toBe(bgBefore.body);
    expect(bgOpen.root).toBe(bgBefore.root);
    expect(bgOpen.html).not.toBe("rgb(0, 0, 0)");
    expect(bgOpen.body).not.toBe("rgb(0, 0, 0)");
    expect(bgOpen.root).not.toBe("rgb(0, 0, 0)");

    await page.keyboard.press("Escape");
    await page
      .locator(".yarl__portal")
      .waitFor({ state: "detached", timeout: 5_000 });
    await page.waitForTimeout(150);

    const bgAfter = await page.evaluate(() => ({
      html: window.getComputedStyle(document.documentElement).backgroundColor,
      body: window.getComputedStyle(document.body).backgroundColor,
      root: window.getComputedStyle(document.getElementById("root")!)
        .backgroundColor,
    }));
    expect(bgAfter).toEqual(bgBefore);
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
