import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

// Pinch-to-open + zoom-hold tests. Run via Chromium-emulated mobile
// (hasTouch + isMobile via Pixel 5 device + iOS UA override). CDP is
// used for multi-touch because Playwright's stable Touch API doesn't
// support pinch.
//
// Setup discipline:
//  • `?touch=1` URL param forces our PhotoStrip into touch mode even
//    when the matchMedia probe might lag during hydration.
//  • We wait for `data-touch-mode="true"` on the strip viewport before
//    dispatching, otherwise the React-attached native touch handlers
//    aren't installed yet and the CDP touchstart goes nowhere.

async function waitForStripReady(page: Page) {
  await page
    .locator('[data-photo-strip][data-touch-mode="true"]')
    .first()
    .waitFor({ state: "attached", timeout: 15_000 });
}

async function snapshotFirstPhotoCenter(page: Page) {
  // Scroll the strip into view via plain JS (autodrift makes the
  // button non-stable for Playwright's wait-for-stable scroll-into-
  // view). Then grab the bbox once.
  await page.evaluate(() => {
    document
      .querySelector('[data-photo-strip] div.flex.flex-nowrap')
      ?.scrollIntoView({ block: "center" });
  });
  await page.waitForTimeout(500);
  return await page.evaluate(() => {
    const b = document.querySelector(
      '[data-photo-strip] div.flex.flex-nowrap button',
    );
    if (!(b instanceof HTMLElement)) return null;
    const r = b.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
}

async function pinchOut(page: Page) {
  await waitForStripReady(page);
  const box = await snapshotFirstPhotoCenter(page);
  if (!box) throw new Error("photo button not in DOM");
  // Clamp into viewport.
  const cx = Math.max(60, Math.min(box.x + box.w / 2, 330));
  const cy = Math.max(60, Math.min(box.y + box.h / 2, 780));
  const cdp = await page.context().newCDPSession(page);
  const startSep = 60;
  const endSep = 180;
  const steps = 6;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: cx - startSep / 2, y: cy, id: 0 },
      { x: cx + startSep / 2, y: cy, id: 1 },
    ],
  });
  for (let i = 1; i <= steps; i++) {
    const sep = startSep + ((endSep - startSep) * i) / steps;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: cx - sep / 2, y: cy, id: 0 },
        { x: cx + sep / 2, y: cy, id: 1 },
      ],
    });
    await page.waitForTimeout(15);
  }
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}

test.describe("Pinch-to-open zoom", () => {
  test("lightbox opens after a pinch-out gesture", async ({ page }) => {
    await page.goto("/?touch=1", { waitUntil: "load" });
    await pinchOut(page);
    await page
      .locator(".yarl__container")
      .waitFor({ state: "attached", timeout: 5_000 });
    const found = await page.locator(".yarl__container").count();
    expect(found).toBeGreaterThan(0);
  });

  test("lightbox opens at scale ≥ 2", async ({ page }) => {
    await page.goto("/?touch=1", { waitUntil: "load" });
    await pinchOut(page);
    await page
      .locator(".yarl__slide_current .yarl__fullsize")
      .waitFor({ state: "attached", timeout: 5_000 });
    await page.waitForTimeout(500);
    const transform = await page.evaluate(() => {
      const el = document.querySelector(
        ".yarl__slide_current .yarl__fullsize",
      );
      if (!(el instanceof HTMLElement)) return null;
      return el.style.transform || null;
    });
    expect(transform, "lightbox wrapper transform missing").not.toBeNull();
    const m = (transform as string).match(/scale\(([\d.]+)\)/);
    expect(m, `expected scale() in transform, got ${transform}`).not.toBeNull();
    const scale = parseFloat(m![1]);
    expect(scale, `seed scale ${scale}`).toBeGreaterThanOrEqual(2);
  });

  test("zoom does NOT drop below 1.5 within 2.5s after release", async ({
    page,
  }) => {
    await page.goto("/?touch=1", { waitUntil: "load" });
    await pinchOut(page);
    await page
      .locator(".yarl__slide_current .yarl__fullsize")
      .waitFor({ state: "attached", timeout: 5_000 });
    const samples: { t: number; scale: number | null }[] = [];
    const start = Date.now();
    while (Date.now() - start < 2500) {
      const scale = await page.evaluate(() => {
        const el = document.querySelector(
          ".yarl__slide_current .yarl__fullsize",
        );
        if (!(el instanceof HTMLElement)) return null;
        const tr = el.style.transform;
        const m = tr ? tr.match(/scale\(([\d.]+)\)/) : null;
        return m ? parseFloat(m[1]) : null;
      });
      samples.push({ t: Date.now() - start, scale });
      await page.waitForTimeout(80);
    }
    // Allow first 200ms to be variable while seed lands.
    const lateSamples = samples.filter((s) => s.t >= 200);
    const minLate = lateSamples.reduce(
      (m, s) => (s.scale !== null ? Math.min(m, s.scale) : m),
      Infinity,
    );
    if (minLate < 1.5) {
      // eslint-disable-next-line no-console
      console.log("zoom-drop trajectory:", JSON.stringify(samples));
    }
    expect(
      minLate,
      `min scale after t=200ms; full samples in console`,
    ).toBeGreaterThanOrEqual(1.5);
  });
});
