import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

// Pinch-to-open + zoom-hold tests.
//
// We bypass real multi-touch dispatch (Chromium's
// `Input.dispatchTouchEvent` does not reliably deliver to React-
// attached native non-passive `touchstart` listeners) and instead
// drive the seed-zoom path via a window test hook exposed by
// GalleryProvider:
//
//   window.__bulkaTest = {
//     setPendingZoom(scale)   // sets pendingZoomRef.current
//     getPendingZoom()        // reads pendingZoomRef.current
//     setPinchActive(bool)    // sets pinchActiveRef.current
//   }
//
// This isolates the zoom-state-synchronisation logic from the gesture
// delivery layer and lets us TDD the actual user-visible bug
// ("растянул, отпустил, картинка в лайтбоксе не синхронизирована")
// against a Chromium-emulated iPhone-13 without needing a real device
// in the loop.

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
      | { setPendingZoom: (n: number) => void; setPinchActive: (b: boolean) => void }
      | undefined;
    if (!t) throw new Error("__bulkaTest hook not present");
    t.setPendingZoom(v);
    // Mimic the post-finishGesture state: gesture done, but the 600ms
    // grace window where pinchActiveRef stays true is what protects the
    // seed from being nuked by an under-finger touchstart on the
    // newly-mounted lightbox container. We set it to true here too so
    // the test exercises the same protection path the real user has.
    t.setPinchActive(true);
    window.setTimeout(() => t.setPinchActive(false), 600);
  }, scale);
}

async function tapFirstPhoto(page: Page) {
  // Click the first photo button (any visible one). This bypasses the
  // pinch overlay flow but exercises the same handleOpen → setIsOpen →
  // mount-effect → changeZoom path.
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

async function readSlideScale(page: Page): Promise<number | null> {
  return await page.evaluate(() => {
    const el = document.querySelector(
      ".yarl__slide_current .yarl__fullsize",
    );
    if (!(el instanceof HTMLElement)) return null;
    const tr = el.style.transform;
    const m = tr ? tr.match(/scale\(([\d.]+)\)/) : null;
    return m ? parseFloat(m[1]) : null;
  });
}

test.describe("Seed zoom carries through to lightbox", () => {
  test("opening lightbox with pendingZoom=2.5 makes slide render at scale ≈2.5", async ({
    page,
  }) => {
    await page.goto("/?touch=1", { waitUntil: "load" });
    await waitForGalleryReady(page);
    await setSeedZoom(page, 2.5);
    await tapFirstPhoto(page);
    await page
      .locator(".yarl__slide_current .yarl__fullsize")
      .waitFor({ state: "attached", timeout: 5_000 });
    // Allow up to 600ms for the mount-effect rAF poll to attach yarl's
    // ZoomRef and dispatch changeZoom.
    await page.waitForTimeout(600);
    const scale = await readSlideScale(page);
    expect(scale, `expected scale ≈2.5, got ${scale}`).not.toBeNull();
    expect(scale!).toBeGreaterThan(1.5);
  });

  test("seed scale survives yarl's post-decode reset (held for 2s)", async ({
    page,
  }) => {
    await page.goto("/?touch=1", { waitUntil: "load" });
    await waitForGalleryReady(page);
    await setSeedZoom(page, 2.5);
    await tapFirstPhoto(page);
    await page
      .locator(".yarl__slide_current .yarl__fullsize")
      .waitFor({ state: "attached", timeout: 5_000 });
    const samples: { t: number; scale: number | null }[] = [];
    const start = Date.now();
    while (Date.now() - start < 2000) {
      samples.push({ t: Date.now() - start, scale: await readSlideScale(page) });
      await page.waitForTimeout(80);
    }
    const lateSamples = samples.filter((s) => s.t >= 200);
    const minLate = lateSamples.reduce(
      (m, s) => (s.scale !== null ? Math.min(m, s.scale) : m),
      Infinity,
    );
    if (minLate < 1.5) {
      // eslint-disable-next-line no-console
      console.log("seed-drop trajectory:", JSON.stringify(samples));
    }
    expect(
      minLate,
      `min scale after t=200ms (full samples in console)`,
    ).toBeGreaterThanOrEqual(1.5);
  });
});
