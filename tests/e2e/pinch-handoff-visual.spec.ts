import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const HERO_SELECTOR = "[data-gallery-image]";

const fixtureSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000" shape-rendering="crispEdges">
  <rect width="800" height="1000" fill="#d96f3d"/>
  <rect x="0" y="0" width="400" height="500" fill="#184e77"/>
  <rect x="400" y="0" width="400" height="500" fill="#f4d35e"/>
  <rect x="0" y="500" width="400" height="500" fill="#2a9d8f"/>
  <rect x="400" y="500" width="400" height="500" fill="#7b2cbf"/>
  <rect x="330" y="430" width="140" height="140" fill="#ffffff"/>
  <rect x="360" y="460" width="80" height="80" fill="#111111"/>
</svg>`;

async function waitForGalleryReady(page: Page) {
  await page.locator(HERO_SELECTOR).first().waitFor({
    state: "attached",
    timeout: 15_000,
  });
  await page.waitForFunction(
    () =>
      typeof (window as unknown as Record<string, unknown>).__bulkaTest ===
      "object",
    { timeout: 5_000 },
  );
}

async function installPortraitFixture(page: Page) {
  await page.route(
    /\/images\/photo-set\/(?:thumbs\/)?ps_portrait\.webp$/,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: fixtureSvg,
      }),
  );
}

async function makeHeroGeometryStable(page: Page) {
  await page.evaluate((selector) => {
    const btn = document.querySelector(selector) as HTMLElement | null;
    const img = btn?.querySelector("img") as HTMLImageElement | null;
    if (!btn || !img) throw new Error("hero gallery image not found");
    btn.style.width = "240px";
    btn.style.height = "300px";
    btn.style.borderRadius = "0";
    img.style.width = "240px";
    img.style.height = "300px";
    img.style.borderRadius = "0";
    img.style.objectFit = "cover";
    img.style.objectPosition = "center";
    img.style.imageRendering = "pixelated";
    const style = document.createElement("style");
    style.textContent =
      '[data-testid="pinch-transition-clone"], .yarl__slide_image { image-rendering: pixelated !important; }';
    document.head.appendChild(style);
  }, HERO_SELECTOR);
  await page.waitForFunction((selector) => {
    const img = document.querySelector(
      `${selector} img`,
    ) as HTMLImageElement | null;
    return Boolean(img?.complete && img.naturalWidth > 0);
  }, HERO_SELECTOR);
}

type Clip = { x: number; y: number; width: number; height: number };

test.describe("pinch-to-open visual handoff", () => {
  test.beforeEach(async ({ page }) => {
    await installPortraitFixture(page);
    await page.goto("/?touch=1", { waitUntil: "load" });
    await waitForGalleryReady(page);
    await makeHeroGeometryStable(page);
  });

  test("lightbox is painted under the transition clone before the clone dismisses", async ({
    page,
  }) => {
    const scale = 2;
    const dx = 30;
    const dy = 40;

    const rect = await page.evaluate(
      ({ selector, scale: s, dx: x, dy: y }) => {
        const t = (window as unknown as Record<string, unknown>).__bulkaTest as
          | {
              beginPinchHandoff: (
                selector: string,
                opts: { scale: number; dx: number; dy: number },
              ) => Clip;
            }
          | undefined;
        if (!t) throw new Error("__bulkaTest hook not present");
        return t.beginPinchHandoff(selector, { scale: s, dx: x, dy: y });
      },
      { selector: HERO_SELECTOR, scale, dx, dy },
    );

    await page.waitForFunction(
      ({ expectedWidth, expectedCenterX, expectedCenterY }) => {
        const clone = document.querySelector(
          '[data-testid="pinch-transition-clone"]',
        ) as HTMLImageElement | null;
        if (!clone) return false;
        const r = clone.getBoundingClientRect();
        return (
          Math.abs(r.width - expectedWidth) <= 2 &&
          Math.abs(r.left + r.width / 2 - expectedCenterX) <= 2 &&
          Math.abs(r.top + r.height / 2 - expectedCenterY) <= 2
        );
      },
      {
        expectedWidth: rect.width,
        expectedCenterX: rect.x + rect.width / 2,
        expectedCenterY: rect.y + rect.height / 2,
      },
      { timeout: 3_000 },
    );

    await page.evaluate((selector) => {
      const t = (window as unknown as Record<string, unknown>).__bulkaTest as
        | { commitPinchHandoff: (selector: string) => void }
        | undefined;
      if (!t) throw new Error("__bulkaTest hook not present");
      t.commitPinchHandoff(selector);
    }, HERO_SELECTOR);

    await page.locator(".yarl__portal").waitFor({
      state: "attached",
      timeout: 5_000,
    });
    await page.locator('[data-testid="pinch-transition-overlay"]').waitFor({
      state: "attached",
      timeout: 1_000,
    });

    await page.waitForFunction(
      ({ expectedWidth, expectedCenterX, expectedCenterY }) => {
        const img = document.querySelector(
          ".yarl__slide_current .yarl__fullsize img",
        ) as HTMLImageElement | null;
        const overlay = document.querySelector(
          '[data-testid="pinch-transition-overlay"]',
        ) as HTMLElement | null;
        if (!img || !overlay) return false;
        const r = img.getBoundingClientRect();
        return (
          Math.abs(r.width - expectedWidth) <= 2 &&
          Math.abs(r.left + r.width / 2 - expectedCenterX) <= 2 &&
          Math.abs(r.top + r.height / 2 - expectedCenterY) <= 2
        );
      },
      {
        expectedWidth: rect.width,
        expectedCenterX: rect.x + rect.width / 2,
        expectedCenterY: rect.y + rect.height / 2,
      },
      { timeout: 3_000 },
    );

    const overlayOpacityWhileLightboxReady = await page.evaluate(() => {
      const overlay = document.querySelector(
        '[data-testid="pinch-transition-overlay"]',
      ) as HTMLElement | null;
      return overlay ? Number(getComputedStyle(overlay).opacity) : 0;
    });
    expect(overlayOpacityWhileLightboxReady).toBe(1);

    await page.evaluate(() => {
      const t = (window as unknown as Record<string, unknown>).__bulkaTest as
        | { setPinchActive: (active: boolean) => void }
        | undefined;
      if (!t) throw new Error("__bulkaTest hook not present");
      t.setPinchActive(false);
    });

    await page.locator('[data-testid="pinch-transition-overlay"]').waitFor({
      state: "detached",
      timeout: 3_000,
    });

    await page.waitForFunction(
      () =>
        document
          .querySelector(".yarl__slide_current .yarl__fullsize")
          ?.getAttribute("data-bulka-seed-centered") === "true",
      undefined,
      { timeout: 3_000 },
    );

    const centeredDelta = await page.evaluate(() => {
      const img = document.querySelector(
        ".yarl__slide_current .yarl__fullsize img",
      ) as HTMLImageElement | null;
      const container = document.querySelector(".yarl__container") as HTMLElement | null;
      if (!img || !container) return null;
      const imgRect = img.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      return {
        dx: Math.abs(
          imgRect.left +
            imgRect.width / 2 -
            (containerRect.left + containerRect.width / 2),
        ),
        dy: Math.abs(
          imgRect.top +
            imgRect.height / 2 -
            (containerRect.top + containerRect.height / 2),
        ),
      };
    });
    expect(centeredDelta, "could not measure centered lightbox image").not.toBeNull();
    expect(centeredDelta!.dx).toBeLessThan(3);
    expect(centeredDelta!.dy).toBeLessThan(3);
  });

  test("final finger pan is included in the seeded lightbox position", async ({
    page,
  }) => {
    const scale = 2;
    const dx = -55;
    const dy = 70;
    const rect = await page.evaluate(
      ({ selector, scale: s, dx: x, dy: y }) => {
        const t = (window as unknown as Record<string, unknown>).__bulkaTest as
          | {
              beginPinchHandoff: (
                selector: string,
                opts: { scale: number; dx: number; dy: number },
              ) => Clip;
              commitPinchHandoff: (selector: string) => void;
            }
          | undefined;
        if (!t) throw new Error("__bulkaTest hook not present");
        const r = t.beginPinchHandoff(selector, { scale: s, dx: x, dy: y });
        t.commitPinchHandoff(selector);
        return r;
      },
      { selector: HERO_SELECTOR, scale, dx, dy },
    );

    await page.locator(".yarl__portal").waitFor({
      state: "attached",
      timeout: 5_000,
    });

    await page.waitForFunction(
      ({ expectedCenterX, expectedCenterY }) => {
        const img = document.querySelector(
          ".yarl__slide_current .yarl__fullsize img",
        ) as HTMLImageElement | null;
        if (!img) return false;
        const r = img.getBoundingClientRect();
        return (
          Math.abs(r.left + r.width / 2 - expectedCenterX) <= 2 &&
          Math.abs(r.top + r.height / 2 - expectedCenterY) <= 2
        );
      },
      {
        expectedCenterX: rect.x + rect.width / 2,
        expectedCenterY: rect.y + rect.height / 2,
      },
      { timeout: 3_000 },
    );

    await page.evaluate(() => {
      const t = (window as unknown as Record<string, unknown>).__bulkaTest as
        | { setPinchActive: (active: boolean) => void }
        | undefined;
      if (!t) throw new Error("__bulkaTest hook not present");
      t.setPinchActive(false);
    });
  });

  test("seeded pan remains aligned when fullscreen viewport is taller than visual viewport", async ({
    page,
  }) => {
    await page.evaluate(() => {
      document.documentElement.style.setProperty(
        "--bulka-viewport-height",
        "960px",
      );
    });

    const scale = 2;
    const dx = 25;
    const dy = -60;
    const rect = await page.evaluate(
      ({ selector, scale: s, dx: x, dy: y }) => {
        const t = (window as unknown as Record<string, unknown>).__bulkaTest as
          | {
              beginPinchHandoff: (
                selector: string,
                opts: { scale: number; dx: number; dy: number },
              ) => Clip;
              commitPinchHandoff: (selector: string) => void;
            }
          | undefined;
        if (!t) throw new Error("__bulkaTest hook not present");
        const r = t.beginPinchHandoff(selector, { scale: s, dx: x, dy: y });
        t.commitPinchHandoff(selector);
        return r;
      },
      { selector: HERO_SELECTOR, scale, dx, dy },
    );

    await page.locator(".yarl__portal").waitFor({
      state: "attached",
      timeout: 5_000,
    });

    await page.waitForFunction(
      ({ expectedCenterX, expectedCenterY }) => {
        const img = document.querySelector(
          ".yarl__slide_current .yarl__fullsize img",
        ) as HTMLImageElement | null;
        if (!img) return false;
        const r = img.getBoundingClientRect();
        return (
          Math.abs(r.left + r.width / 2 - expectedCenterX) <= 2 &&
          Math.abs(r.top + r.height / 2 - expectedCenterY) <= 2
        );
      },
      {
        expectedCenterX: rect.x + rect.width / 2,
        expectedCenterY: rect.y + rect.height / 2,
      },
      { timeout: 3_000 },
    );

    await page.evaluate(() => {
      const t = (window as unknown as Record<string, unknown>).__bulkaTest as
        | { setPinchActive: (active: boolean) => void }
        | undefined;
      if (!t) throw new Error("__bulkaTest hook not present");
      t.setPinchActive(false);
    });
  });
});
