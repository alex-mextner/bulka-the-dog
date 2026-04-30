import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { inflateSync } from "node:zlib";

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

function decodePng(buffer: Buffer) {
  const signature = "89504e470d0a1a0a";
  expect(buffer.subarray(0, 8).toString("hex")).toBe(signature);

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat: Buffer[] = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }

  expect(bitDepth).toBe(8);
  const bytesPerPixel = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  expect(
    bytesPerPixel,
    `unsupported PNG color type ${colorType}`,
  ).toBeGreaterThan(0);

  const inflated = inflateSync(Buffer.concat(idat));
  const stride = width * bytesPerPixel;
  const pixels = Buffer.alloc(height * stride);
  let src = 0;

  const paeth = (a: number, b: number, c: number) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    return pb <= pc ? b : c;
  };

  for (let y = 0; y < height; y++) {
    const filter = inflated[src++];
    const row = y * stride;
    const prev = row - stride;
    for (let x = 0; x < stride; x++) {
      const raw = inflated[src++];
      const left = x >= bytesPerPixel ? pixels[row + x - bytesPerPixel] : 0;
      const up = y > 0 ? pixels[prev + x] : 0;
      const upLeft =
        y > 0 && x >= bytesPerPixel ? pixels[prev + x - bytesPerPixel] : 0;
      const value =
        filter === 0
          ? raw
          : filter === 1
            ? raw + left
            : filter === 2
              ? raw + up
              : filter === 3
                ? raw + Math.floor((left + up) / 2)
                : raw + paeth(left, up, upLeft);
      pixels[row + x] = value & 0xff;
    }
  }

  return { width, height, pixels };
}

function countPixelChannelDiff(a: Buffer, b: Buffer) {
  const left = decodePng(a);
  const right = decodePng(b);
  expect(right.width).toBe(left.width);
  expect(right.height).toBe(left.height);
  let diff = 0;
  for (let i = 0; i < left.pixels.length; i++) {
    if (left.pixels[i] !== right.pixels[i]) diff++;
  }
  return diff;
}

function innerClip(rect: Clip): Clip {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  return {
    x: Math.round(cx - 80),
    y: Math.round(cy - 120),
    width: 160,
    height: 240,
  };
}

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

    const clip = innerClip(rect);
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
    const before = await page.screenshot({ clip, animations: "disabled" });

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

    const after = await page.screenshot({ clip, animations: "disabled" });
    expect(
      countPixelChannelDiff(before, after),
      "handoff pixels changed after overlay dismissal",
    ).toBe(0);
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
              setPinchActive: (active: boolean) => void;
            }
          | undefined;
        if (!t) throw new Error("__bulkaTest hook not present");
        const r = t.beginPinchHandoff(selector, { scale: s, dx: x, dy: y });
        t.commitPinchHandoff(selector);
        t.setPinchActive(false);
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
              setPinchActive: (active: boolean) => void;
            }
          | undefined;
        if (!t) throw new Error("__bulkaTest hook not present");
        const r = t.beginPinchHandoff(selector, { scale: s, dx: x, dy: y });
        t.commitPinchHandoff(selector);
        t.setPinchActive(false);
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
  });
});
