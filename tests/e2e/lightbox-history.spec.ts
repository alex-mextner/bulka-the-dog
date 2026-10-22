import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { translations } from "../../client/lib/translations";

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
      '[data-photo-strip] div.flex.flex-nowrap button',
    );
    if (!(btn instanceof HTMLElement)) return false;
    btn.click();
    return true;
  });
  expect(clicked, "no photo button found").toBe(true);
}

test.describe("Lightbox browser history", () => {
  test.beforeEach(async ({ page }) => {
    // Keep accessible button names deterministic while testing browser history.
    await page.addInitScript(() => localStorage.setItem("bulka-language", "ru"));
    await page.goto("/?touch=1", { waitUntil: "load" });
    await waitForGalleryReady(page);
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  });

  test("close button calls history.back() to dismiss lightbox without navigating away from page", async ({
    page,
  }) => {
    const before = await page.evaluate(() => ({
      length: window.history.length,
      href: window.location.href,
    }));

    await tapFirstPhoto(page);
    await page
      .locator(".yarl__portal")
      .waitFor({ state: "attached", timeout: 5_000 });

    const afterOpen = await page.evaluate(() => window.history.length);
    expect(afterOpen).toBe(before.length + 1);

    await page.getByRole("button", { name: translations.ru.accessibility.close, exact: true }).click({ force: true });
    await page
      .locator(".yarl__portal")
      .waitFor({ state: "detached", timeout: 5_000 });

    // history.back() navigates to the previous entry without removing it,
    // so length stays at before.length + 1. What matters is the portal is gone,
    // the URL is intact, and the current state no longer carries __bulkaLightbox.
    const afterClose = await page.evaluate(() => ({
      href: window.location.href,
      length: window.history.length,
      state: window.history.state as { __bulkaLightbox?: number } | null,
    }));
    expect(afterClose.href).toBe(before.href);
    expect(afterClose.length).toBe(before.length + 1);
    expect(afterClose.state?.__bulkaLightbox).toBeUndefined();
  });

  test("browser back closes the lightbox and slide navigation does not add history entries", async ({
    page,
  }) => {
    const before = await page.evaluate(() => ({
      length: window.history.length,
      href: window.location.href,
    }));

    await tapFirstPhoto(page);
    await page
      .locator(".yarl__portal")
      .waitFor({ state: "attached", timeout: 5_000 });

    const afterOpen = await page.evaluate(() => ({
      length: window.history.length,
      href: window.location.href,
      state: window.history.state as { __bulkaLightbox?: number } | null,
    }));
    expect(afterOpen.href).toBe(before.href);
    expect(afterOpen.length).toBe(before.length + 1);
    expect(afterOpen.state?.__bulkaLightbox).toBeGreaterThan(0);

    const next = page.getByRole("button", { name: translations.ru.accessibility.next, exact: true });
    await next.click({ force: true });
    await next.click({ force: true });

    const afterSlides = await page.evaluate(() => ({
      length: window.history.length,
      href: window.location.href,
      state: window.history.state as { __bulkaLightbox?: number } | null,
    }));
    expect(afterSlides.href).toBe(before.href);
    expect(afterSlides.length).toBe(afterOpen.length);
    expect(afterSlides.state?.__bulkaLightbox).toBe(
      afterOpen.state?.__bulkaLightbox,
    );

    await page.evaluate(() => window.history.back());
    await page
      .locator(".yarl__portal")
      .waitFor({ state: "detached", timeout: 5_000 });

    const afterBack = await page.evaluate(() => ({
      href: window.location.href,
      open: Boolean(document.querySelector(".yarl__portal")),
    }));
    expect(afterBack.href).toBe(before.href);
    expect(afterBack.open).toBe(false);
  });
});
