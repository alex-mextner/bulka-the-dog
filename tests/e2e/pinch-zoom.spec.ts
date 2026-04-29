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
  // ── Bug fix: thumbnail/full-image ratio must be factored in ──────────────────
  //
  // PROBLEM: Before the fix, pendingZoomRef held the raw pinch scale relative
  // to the THUMBNAIL, but changeZoom() interprets its argument as scale relative
  // to the FIT-TO-SCREEN image. If the thumbnail is 120px wide and the fit-width
  // is 390px, a 2× pinch on the thumbnail = 0.62× in yarl units — not 2×.
  // The old code passed the raw 2 to changeZoom, producing ~3× more zoom than
  // the user actually performed.
  //
  // FIX: pendingZoomRef now stores thumb_width × pinch_scale (target CSS pixels).
  // The rAF poll reads the actual fit_width from the DOM and computes:
  //   yarl_zoom = clamp(1, maxZoom, target_px / fit_width)
  //
  // setThumbWidth(px) sets pendingThumbWidthRef — when non-zero it signals the
  // rAF poll to use the new pixel-based path. When zero (legacy/unit-test path)
  // the ref value is used directly as yarl zoom (backward compat).
  //
  // Regression guard: verifies the pixel-based thumb/fit-width conversion end-to-end.
  test("pinch scale on thumbnail maps to correct zoom in lightbox (thumb/fit ratio)", async ({
    page,
  }) => {
    await page.goto("/?touch=1", { waitUntil: "load" });
    await waitForGalleryReady(page);

    // Read the actual rendered width of the first thumbnail from the DOM.
    const thumbWidth = await page.evaluate(() => {
      const img = document.querySelector(
        '[data-photo-strip] div.flex.flex-nowrap button img',
      ) as HTMLImageElement | null;
      return img ? img.getBoundingClientRect().width : 0;
    });
    expect(thumbWidth, "could not read thumb width").toBeGreaterThan(0);

    // Simulate: user pinches thumbnail to 2× its size.
    const pinchScale = 2.0;
    // Set pendingZoomRef = thumbWidth × pinchScale (new "target px" semantics).
    await page.evaluate(({ scale, width }) => {
      const t = (window as unknown as Record<string, unknown>).__bulkaTest as
        | { setPendingZoom: (n: number) => void; setPinchActive: (b: boolean) => void; setThumbWidth: (n: number) => void }
        | undefined;
      if (!t) throw new Error("__bulkaTest hook not present");
      // setThumbWidth signals the rAF poll to use pixel-based conversion.
      t.setThumbWidth(width);
      t.setPendingZoom(scale * width);  // target width in CSS px
      t.setPinchActive(true);
      window.setTimeout(() => t.setPinchActive(false), 600);
    }, { scale: pinchScale, width: thumbWidth });

    await tapFirstPhoto(page);
    await page
      .locator(".yarl__slide_current .yarl__fullsize")
      .waitFor({ state: "attached", timeout: 5_000 });
    await page.waitForTimeout(800);

    // Read the rendered pixel width of the full image in the lightbox.
    const renderedWidth = await page.evaluate(() => {
      const img = document.querySelector(
        ".yarl__slide_current .yarl__fullsize img",
      ) as HTMLImageElement | null;
      if (!img) return null;
      return img.getBoundingClientRect().width;
    });
    expect(renderedWidth, "could not read rendered image width").not.toBeNull();

    // Expected: rendered image ≈ thumbWidth × pinchScale (±30% tolerance).
    // Before fix: rendered image ≈ fitWidth × pinchScale (much larger).
    const expected = thumbWidth * pinchScale;
    const tolerance = 0.30;
    expect(
      renderedWidth!,
      `expected rendered width ≈ ${expected.toFixed(0)}px (thumb×scale), got ${renderedWidth!.toFixed(0)}px`,
    ).toBeGreaterThan(expected * (1 - tolerance));
    expect(
      renderedWidth!,
      `expected rendered width ≈ ${expected.toFixed(0)}px (thumb×scale), got ${renderedWidth!.toFixed(0)}px`,
    ).toBeLessThan(expected * (1 + tolerance));
  });

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
