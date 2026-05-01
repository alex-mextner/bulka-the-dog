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

  // ── Pixel-perfect position handoff ──────────────────────────────────────────
  //
  // After a pinch-to-open commit the lightbox must render the image so that
  // its centre on screen is within ~40px of the thumbnail's centre on screen.
  // This validates that the focal-point formula
  //   dx_focal = -(thumbCenterDx) / (yarlZoom - 1)
  // correctly maps the thumbnail position to the yarl pan offset.
  //
  // Tolerance is 40px because:
  //   1. yarl clamps pan to valid bounds (large zoom → less pan freedom)
  //   2. The pixel-based fit_width reading has timing variance (~±1 frame)
  //   3. yarl's maxZoom cap may reduce the effective zoom and pan
  test("lightbox image centre aligns with thumbnail centre after pinch-open (pixel-perfect pan)", async ({
    page,
  }) => {
    await page.goto("/?touch=1", { waitUntil: "load" });
    await waitForGalleryReady(page);

    // Scroll to the photo strip so its buttons are in view.
    // Two-pass scroll: first pass brings strip into viewport so lazy images
    // above it can load; second pass re-centers after any layout shift caused
    // by those images finishing.
    await page.evaluate(() => {
      const strip = document.querySelector('[data-photo-strip]') as HTMLElement | null;
      strip?.scrollIntoView({ block: "center", behavior: "instant" });
    });
    await page.waitForTimeout(500); // let lazy images above strip load + layout settle
    await page.evaluate(() => {
      // Re-center strip using a manual math-based scroll so that the sticky
      // header (which eats effective viewport height) is accounted for.
      const strip = document.querySelector('[data-photo-strip]') as HTMLElement | null;
      if (!strip) return;
      const r = strip.getBoundingClientRect();
      const desiredTop = (window.innerHeight - r.height) / 2;
      window.scrollBy(0, r.top - desiredTop);
    });
    await page.waitForTimeout(200); // allow layout to settle after second scroll

    // Read real thumbnail centre — find a button whose centre is inside the
    // viewport (PhotoStrip uses overflow-x:hidden so not all buttons are in view;
    // we pick the first one whose centre point falls within the visible area).
    const thumbCenter = await page.evaluate(() => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const btns = Array.from(
        document.querySelectorAll('[data-photo-strip] div.flex.flex-nowrap button'),
      ) as HTMLElement[];
      for (const btn of btns) {
        const r = btn.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        if (cx >= 0 && cx <= vw && cy >= 0 && cy <= vh) {
          return { centerX: cx, centerY: cy };
        }
      }
      return null;
    });
    expect(thumbCenter, "no thumbnail button with centre in viewport found after scroll").not.toBeNull();

    // Use thumbWidth = viewport width so that pinchScale=2 guarantees
    // yarlZoom ≥ 1.5 regardless of actual fitWidth — making pan non-trivial.
    // The goal of this test is to verify the focal-point formula, not to
    // simulate an exact real gesture scale.
    const pinchScale = 2.0;
    await page.evaluate(({ scale, thumbCx, thumbCy }) => {
      const t = (window as unknown as Record<string, unknown>).__bulkaTest as
        | {
            setPendingZoom: (n: number) => void;
            setThumbWidth: (n: number) => void;
            setPendingPan: (dx: number, dy: number) => void;
            setPinchActive: (b: boolean) => void;
          }
        | undefined;
      if (!t) throw new Error("__bulkaTest hook not present");
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // Simulate a large thumb so the resulting yarlZoom is well above 1,
      // making pan meaningful. thumbWidth = vw guarantees targetPx = vw*scale.
      const tw = vw;
      t.setThumbWidth(tw);
      t.setPendingZoom(scale * tw);
      // Thumb centre relative to viewport centre — same semantics as real gesture.
      t.setPendingPan(thumbCx - vw / 2, thumbCy - vh / 2);
      t.setPinchActive(true);
    }, { scale: pinchScale, thumbCx: thumbCenter!.centerX, thumbCy: thumbCenter!.centerY });

    // Click the same button we measured (centre in viewport).
    await page.evaluate(() => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const btns = Array.from(
        document.querySelectorAll('[data-photo-strip] div.flex.flex-nowrap button'),
      ) as HTMLElement[];
      for (const btn of btns) {
        const r = btn.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        if (cx >= 0 && cx <= vw && cy >= 0 && cy <= vh) {
          btn.click();
          return;
        }
      }
    });
    await page
      .locator(".yarl__slide_current .yarl__fullsize")
      .waitFor({ state: "attached", timeout: 5_000 });
    // While the opening pinch is still active, the lightbox image should stay
    // aligned to the thumbnail centre. This is the pixel-perfect handoff frame.
    await page.waitForFunction(
      ({ expectedX, expectedY }) => {
        const img = document.querySelector(
          ".yarl__slide_current .yarl__fullsize img",
        ) as HTMLImageElement | null;
        if (!img) return false;
        const r = img.getBoundingClientRect();
        return (
          Math.abs(r.left + r.width / 2 - expectedX) < 40 &&
          Math.abs(r.top + r.height / 2 - expectedY) < 40
        );
      },
      {
        expectedX: thumbCenter!.centerX,
        expectedY: thumbCenter!.centerY,
      },
      { timeout: 3_000 },
    );

    // Read the centre of the full-resolution image in the lightbox.
    const imgCenter = await page.evaluate(() => {
      const img = document.querySelector(
        ".yarl__slide_current .yarl__fullsize img",
      ) as HTMLImageElement | null;
      if (!img) return null;
      const r = img.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    expect(imgCenter, "could not read lightbox image position").not.toBeNull();

    // The image centre must be within 40px of the thumbnail centre.
    // yarl clamps pan to maxOffset so we cannot always hit exactly thumbCenter,
    // but the formula ensures we come as close as the zoom level allows.
    const dxPos = Math.abs(imgCenter!.x - thumbCenter!.centerX);
    const dyPos = Math.abs(imgCenter!.y - thumbCenter!.centerY);
    expect(
      dxPos,
      `image centre X (${imgCenter!.x.toFixed(1)}) vs thumb centre X (${thumbCenter!.centerX.toFixed(1)}): ` +
        `delta ${dxPos.toFixed(1)}px exceeds 40px tolerance`,
    ).toBeLessThan(40);
    expect(
      dyPos,
      `image centre Y (${imgCenter!.y.toFixed(1)}) vs thumb centre Y (${thumbCenter!.centerY.toFixed(1)}): ` +
        `delta ${dyPos.toFixed(1)}px exceeds 40px tolerance`,
    ).toBeLessThan(40);

    await page.evaluate(() => {
      const t = (window as unknown as Record<string, unknown>).__bulkaTest as
        | { setPinchActive: (b: boolean) => void }
        | undefined;
      if (!t) throw new Error("__bulkaTest hook not present");
      t.setPinchActive(false);
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
    expect(centeredDelta, "could not measure centered image after release").not.toBeNull();
    expect(centeredDelta!.dx).toBeLessThan(3);
    expect(centeredDelta!.dy).toBeLessThan(3);
  });
});
