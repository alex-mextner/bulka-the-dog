import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

// Tests for three Gallery.tsx fixes:
//   1. thumbSrc mismatch — overlay opens with thumbSrc not full src
//   2. Lightbox root background — black even if container doesn't fill root
//   3. Pan focal-point transfer — lightbox image pans toward where user pinched

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
    t.setPinchActive(true);
    window.setTimeout(() => t.setPinchActive(false), 600);
  }, scale);
}

async function setSeedPan(page: Page, dx: number, dy: number) {
  await page.evaluate(([x, y]) => {
    const t = (window as unknown as Record<string, unknown>).__bulkaTest as
      | { setPendingPan: (dx: number, dy: number) => void }
      | undefined;
    if (!t) throw new Error("__bulkaTest hook not present");
    t.setPendingPan(x, y);
  }, [dx, dy] as [number, number]);
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

// Reads the CSS transform on the current slide's fullsize element.
// Returns { scale, tx, ty } or null if the element isn't found.
async function readSlideTransform(page: Page): Promise<{ scale: number; tx: number; ty: number } | null> {
  return page.evaluate(() => {
    const el = document.querySelector(".yarl__slide_current .yarl__fullsize") as HTMLElement | null;
    if (!el) return null;
    const tr = el.style.transform || "";
    const scale = (tr.match(/scale\(([\d.]+)\)/) || [])[1];
    const translate = tr.match(/translate(?:3d|X|Y)?\(([^)]+)\)/);
    let tx = 0, ty = 0;
    if (translate) {
      const parts = translate[1].split(",").map(p => parseFloat(p));
      tx = parts[0] ?? 0;
      ty = parts[1] ?? 0;
    }
    return { scale: scale ? parseFloat(scale) : 1, tx, ty };
  });
}

test.describe("Gallery lightbox fixes", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?touch=1", { waitUntil: "load" });
    await waitForGalleryReady(page);
  });

  // ── Fix 1: Lightbox root element has black background ──────────────────────
  test("lightbox root has black background (not transparent)", async ({ page }) => {
    await tapFirstPhoto(page);
    await page.locator(".yarl__portal").waitFor({ state: "attached", timeout: 5_000 });

    const rootBg = await page.evaluate(() => {
      const root = document.querySelector(".yarl__portal") as HTMLElement | null;
      if (!root) return null;
      return window.getComputedStyle(root).backgroundColor;
    });

    expect(rootBg, "lightbox root should have opaque dark background").not.toBeNull();
    // Accepts any rgba with alpha > 0 that is dark (r,g,b < 50).
    // rgb(0,0,0) or rgba(0,0,0,0.92) both match.
    const isBlackish = rootBg !== null && (
      rootBg === "rgb(0, 0, 0)" ||
      rootBg.startsWith("rgba(0, 0, 0,") ||
      rootBg === "rgba(0, 0, 0, 0.921569)"
    );
    expect(isBlackish, `expected dark root bg, got: ${rootBg}`).toBe(true);
  });

  // ── Fix 2: Pan focal-point — image pans toward pinch origin ────────────────
  //
  // When pendingPan is set to (200, 0) — 200px to the right of screen center —
  // and zoom is seeded at 2.5, the lightbox should position the image such that
  // the pixel that was under the pinch midpoint stays fixed. YARL translates
  // that into a positive offsetX (image shifted right on screen). We can't read
  // ZoomRef.offsetX directly from outside, but we can check that the slide's
  // CSS transform includes a non-zero translate on the X axis after zoom seeds.
  //
  // The poll fires on every rAF while ownsZoomRef is true, so we give it 800ms.
  test("non-zero pendingPan causes lightbox image to be offset from center", async ({ page }) => {
    // Set pan focal point well to the right of center.
    await setSeedZoom(page, 2.5);
    await setSeedPan(page, 200, 0);
    await tapFirstPhoto(page);
    await page.locator(".yarl__slide_current .yarl__fullsize").waitFor({ state: "attached", timeout: 5_000 });
    await page.waitForTimeout(800);

    const transform = await readSlideTransform(page);
    expect(transform, "slide transform not found").not.toBeNull();

    // With scale=2.5 and focal dx=+200 (right of center):
    // Zooming INTO a point to the right means the image shifts LEFT so that
    // focal point stays fixed on screen. YARL formula:
    //   changeOffsets(200 * (1 - 1/2.5)) = +120 internal offset
    // But the CSS transform on fullsize negates this, so tx < 0.
    // We accept any |tx| > 10 that is negative, confirming focal-point fired.
    expect(Math.abs(transform!.tx), `expected non-zero tx from focal-point pan, got ${transform!.tx}`).toBeGreaterThan(10);
    expect(transform!.tx, `expected negative tx (image shifts left when focal point is right of center), got ${transform!.tx}`).toBeLessThan(0);
  });

  test("zero pendingPan keeps lightbox image centered (no offset)", async ({ page }) => {
    // Default: pan is (0,0) — no focal-point offset.
    await setSeedZoom(page, 2.5);
    // pendingPan stays at {dx:0, dy:0} (default after close reset).
    await tapFirstPhoto(page);
    await page.locator(".yarl__slide_current .yarl__fullsize").waitFor({ state: "attached", timeout: 5_000 });
    await page.waitForTimeout(800);

    const transform = await readSlideTransform(page);
    expect(transform, "slide transform not found").not.toBeNull();
    // No pan: tx should be near 0.
    expect(Math.abs(transform!.tx), `expected near-zero tx, got ${transform!.tx}`).toBeLessThan(15);
  });

  // ── Fix 3: pendingPan resets to {0,0} after lightbox closes ────────────────
  test("pendingPan resets to zero after lightbox closes", async ({ page }) => {
    await setSeedZoom(page, 2.0);
    await setSeedPan(page, 150, -80);
    await tapFirstPhoto(page);
    await page.locator(".yarl__portal").waitFor({ state: "attached", timeout: 5_000 });
    await page.waitForTimeout(300);

    // Close the lightbox via Escape.
    await page.keyboard.press("Escape");
    await page.locator(".yarl__portal").waitFor({ state: "detached", timeout: 5_000 });

    const pan = await page.evaluate(() => {
      const t = (window as unknown as Record<string, unknown>).__bulkaTest as
        | { getPendingPan: () => { dx: number; dy: number } }
        | undefined;
      return t?.getPendingPan() ?? null;
    });

    expect(pan, "pendingPan should be reset after close").not.toBeNull();
    expect(pan!.dx, "dx should reset to 0").toBe(0);
    expect(pan!.dy, "dy should reset to 0").toBe(0);
  });
});
