import { expect, test } from "@playwright/test";

// Bug repro: pinch-out on a thumbnail opens the lightbox at the user's
// pinch scale, but on the current build the zoom resets to 1 once the
// fingers lift — yarl's image-decode reset and React's render cycle
// produce a paint at scale(1) before the on.zoom callback can re-apply
// the seed. The fix uses a MutationObserver that catches yarl's inline
// `style.transform` writes in the same microtask (= before paint) and
// overrides them when we still own the zoom.
//
// Multi-touch pinches go through CDP because Playwright's stable touch
// API only supports single-finger taps.

async function pinchOut(page: import("@playwright/test").Page) {
  const handle = page.locator(".yarl__container");
  // Scroll the gallery section into view so the strip is visible.
  // We can't scrollIntoViewIfNeeded on the photo button itself — its
  // autodrift makes Playwright's stability check time out.
  await page.evaluate(() => {
    document.getElementById("gallery")?.scrollIntoView({ block: "center" });
  });
  await page.waitForTimeout(400);
  // Snapshot the button rect via JS once — the drift moves it ~16 px/s,
  // a few-frame window between read and dispatch is fine.
  const box = await page.evaluate(() => {
    const b = document
      .querySelector("div.flex.flex-nowrap.items-center.pt-8.pb-12 button");
    if (!(b instanceof HTMLElement)) return null;
    const r = b.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  if (!box) throw new Error("photo not laid out");
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  void handle;

  const cdp = await page.context().newCDPSession(page);
  const startSep = 60;
  const endSep = 180;
  const steps = 6;
  const startTouches = [
    { x: cx - startSep / 2, y: cy, id: 0 },
    { x: cx + startSep / 2, y: cy, id: 1 },
  ];
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: startTouches.map((t) => ({ x: t.x, y: t.y, id: t.id })),
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

test.describe("Pinch-to-open zoom hold", () => {
  test("lightbox opens at scale ≥ 2 after pinch-out", async ({ page }) => {
    await page.goto("/?touch=1", { waitUntil: "load" });
    await pinchOut(page);
    // Allow the seed-zoom apply to land.
    await page.waitForTimeout(300);
    const transform = await page.evaluate(() => {
      const el = document.querySelector(
        ".yarl__slide_current .yarl__fullsize",
      );
      if (!(el instanceof HTMLElement)) return null;
      return el.style.transform || null;
    });
    expect(transform).not.toBeNull();
    const m = (transform as string).match(/scale\(([\d.]+)\)/);
    expect(m).not.toBeNull();
    const scale = parseFloat(m![1]);
    expect(scale).toBeGreaterThanOrEqual(2);
  });

  test("zoom does NOT drop to 1 within 2.5s after release", async ({
    page,
  }) => {
    await page.goto("/?touch=1", { waitUntil: "load" });
    await pinchOut(page);
    // Sample inline transform every 80ms for 2.5s. Catches the
    // yarl-decode-reset paint flash that fires between ~50ms and ~2s
    // depending on connection speed.
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
    // Fail loud with the trajectory if any sample is below 1.5 (= zoom
    // got reset). Allow first 200ms to be variable while seed lands.
    const lateSamples = samples.filter((s) => s.t >= 200);
    const minLate = lateSamples.reduce(
      (m, s) => (s.scale !== null ? Math.min(m, s.scale) : m),
      Infinity,
    );
    if (minLate < 1.5) {
      console.log("Zoom-drop trajectory:", samples);
    }
    expect(minLate, `min scale after t=200ms (full samples in console)`).toBeGreaterThanOrEqual(1.5);
  });

  test("user touch inside lightbox releases ownership and lets yarl's pinch take over", async ({
    page,
  }) => {
    await page.goto("/?touch=1", { waitUntil: "load" });
    await pinchOut(page);
    await page.waitForTimeout(400);

    // Tap somewhere inside the lightbox container (not on an interactive
    // element though — anywhere in the slide area is fine).
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: 195, y: 422, id: 0 }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });

    // After ownership-release, simulate yarl resetting zoom (force via
    // direct yarl ZoomRef call would require harness; instead we just
    // record that subsequent direct manipulation of zoom isn't undone
    // by us). Easiest assertion: the page has no lingering interval
    // that re-applies after a manual override. We force scale 1 via
    // setting yarl's inline transform style directly and verify it
    // stays at 1 for ≥500ms.
    const overrode = await page.evaluate(() => {
      const el = document.querySelector(
        ".yarl__slide_current .yarl__fullsize",
      );
      if (!(el instanceof HTMLElement)) return false;
      el.style.transform = "scale(1) translateX(0px) translateY(0px)";
      return true;
    });
    expect(overrode).toBe(true);
    await page.waitForTimeout(600);
    const finalTransform = await page.evaluate(() => {
      const el = document.querySelector(
        ".yarl__slide_current .yarl__fullsize",
      );
      if (!(el instanceof HTMLElement)) return null;
      return el.style.transform || null;
    });
    // After ownership-release we must NOT have reverted the override.
    // (yarl's own React state may produce another scale via its renders,
    // but our code shouldn't be re-applying our seed value.)
    const m = (finalTransform as string | null)?.match(/scale\(([\d.]+)\)/);
    const finalScale = m ? parseFloat(m[1]) : null;
    expect(finalScale, "ownership should be released after user touch").not.toBeGreaterThan(1.5);
  });
});
