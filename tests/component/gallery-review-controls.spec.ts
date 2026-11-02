/**
 * Mounts the production gallery with context probes in a test-only document.
 * Frozen browser time proves timer overlap across separate thumbnail hooks;
 * the probes read real refs and invoke the public close callback.
 */
import { expect, test, type Page } from "@playwright/test";

const OVERLAY = '[data-testid="pinch-transition-overlay"]';
const CLONE = '[data-testid="pinch-transition-clone"]';
const fixture = `<!doctype html><html><head><style>
body { margin: 0; }
[data-gallery-image] { display: block; width: 200px; height: 200px; }
[data-gallery-image] img { width: 100%; height: 100%; object-fit: cover; }
</style></head><body><div id="root"></div><script type="module">
import React from "/node_modules/.vite/deps/react.js";
import { ViteReactSSG } from "/node_modules/.vite/deps/vite-react-ssg_single-page.js";
import RefreshRuntime from "/@react-refresh";
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => type => type;
window.__vite_plugin_react_preamble_installed__ = true;
const { GalleryProvider, GalleryImage, GalleryLightbox, useGallery } = await import("/client/components/Gallery.tsx");
function Controls() {
  const gallery = useGallery();
  const read = event => {
    const button = event.currentTarget;
    button.dataset.active = String(gallery.pinchActiveRef.current);
    button.dataset.zoom = String(gallery.pendingZoomRef.current);
    button.dataset.width = String(gallery.pendingThumbWidthRef.current);
    button.dataset.panX = String(gallery.pendingPanRef.current.dx);
    button.dataset.panY = String(gallery.pendingPanRef.current.dy);
  };
  return React.createElement(React.Fragment, null,
    React.createElement("button", { id: "read-state", onClick: read }, "Read state"),
    React.createElement("button", { id: "close-gallery", onClick: gallery.close }, "Close gallery"),
    ...["a", "b"].map(id => React.createElement(GalleryImage, {
      key: id, src: "/gallery-review/full-" + id + ".svg",
      thumbSrc: "/gallery-review/thumb-" + id + ".svg",
      alt: "Fixture " + id, loading: "eager"
    })));
}
ViteReactSSG(React.createElement(GalleryProvider, null,
  React.createElement(Controls), React.createElement(GalleryLightbox)));
</script></body></html>`;

async function touch(
  page: Page,
  index: number,
  type: "touchstart" | "touchmove" | "touchend" | "touchcancel",
  spread = 30,
) {
  await page
    .locator("[data-gallery-image]")
    .nth(index)
    .evaluate(
      (element, { eventType, distance }) => {
        const rect = element.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const touches =
          eventType === "touchend" || eventType === "touchcancel"
            ? []
            : [-1, 1].map(
                (side, identifier) =>
                  new Touch({
                    identifier,
                    target: element,
                    clientX: x + side * distance,
                    clientY: y,
                  }),
              );
        element.dispatchEvent(
          new TouchEvent(eventType, {
            bubbles: true,
            cancelable: true,
            touches,
            targetTouches: touches,
            changedTouches: touches,
          }),
        );
      },
      { eventType: type, distance: spread },
    );
}

async function readState(page: Page) {
  return page.locator("#read-state").evaluate((button) => {
    if (!(button instanceof HTMLButtonElement))
      throw new Error("state probe missing");
    button.click();
    return {
      active: button.getAttribute("data-active") === "true",
      zoom: Number(button.getAttribute("data-zoom")),
      width: Number(button.getAttribute("data-width")),
      panX: Number(button.getAttribute("data-pan-x")),
      panY: Number(button.getAttribute("data-pan-y")),
    };
  });
}

async function closeGallery(page: Page) {
  await page.locator("#close-gallery").evaluate((button) => {
    if (!(button instanceof HTMLButtonElement))
      throw new Error("close control missing");
    button.click();
  });
  await page.clock.runFor(16);
}

async function expand(page: Page, index: number) {
  await touch(page, index, "touchstart");
  await page.clock.runFor(32);
  await touch(page, index, "touchmove", 60);
  await page.clock.runFor(32);
}

test.beforeEach(async ({ page }) => {
  await page.route("**/gallery-review/*.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="orange"/></svg>',
    }),
  );
  await page.route("**/__gallery-review", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: fixture,
    }),
  );
  await page.goto("/__gallery-review");
  await expect(page.locator("[data-gallery-image]")).toHaveCount(2);
  await page.clock.install({ time: new Date("2026-11-02T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-11-02T12:00:01Z"));
});

for (const interruption of ["close", "cancel"] as const) {
  test(`${interruption}: a new gesture resets opacity and animation state inside the old timer window`, async ({
    page,
  }, testInfo) => {
    await expand(page, 0);
    let interruptedAt: number;
    if (interruption === "close") {
      await touch(page, 0, "touchend");
      await page.clock.runFor(32);
      interruptedAt = await page.evaluate(() => Date.now());
      await closeGallery(page);
    } else {
      interruptedAt = await page.evaluate(() => Date.now());
      await touch(page, 0, "touchcancel");
      await page.clock.runFor(16);
    }
    await expect(page.locator(CLONE)).toHaveAttribute(
      "src",
      new URL("/gallery-review/thumb-a.svg", page.url()).href,
    );
    const startedAt = await page.evaluate(() => Date.now());
    expect(startedAt - interruptedAt).toBe(16);
    await touch(page, 1, "touchstart");
    await page.clock.runFor(32);
    const paintedAt = await page.evaluate(() => Date.now());
    expect(paintedAt - interruptedAt).toBe(48);
    await expect(page.locator(CLONE)).toHaveAttribute(
      "src",
      new URL("/gallery-review/thumb-b.svg", page.url()).href,
    );
    const restart = await page.locator(OVERLAY).evaluate((root) => {
      const image = root.querySelector("img");
      const dim = root.querySelector("div");
      if (!image || !dim) throw new Error("gesture layers missing");
      return {
        opacity: getComputedStyle(root).opacity,
        rootTransition: getComputedStyle(root).transitionDuration,
        imageTransition: getComputedStyle(image).transitionDuration,
        dimTransition: getComputedStyle(dim).transitionDuration,
        imageTransform: getComputedStyle(image).transform,
        dim: getComputedStyle(dim).backgroundColor,
      };
    });
    await testInfo.attach("restart-state", {
      contentType: "application/json",
      body: JSON.stringify({ interruptedAt, startedAt, paintedAt, ...restart }),
    });
    await expect(page.locator(OVERLAY)).toHaveCSS("opacity", "1");
    await expect(page.locator(OVERLAY)).toHaveCSS("transition-duration", "0s");
    await expect(page.locator(CLONE)).toHaveCSS("transition-duration", "0s");
    await expect(page.locator(`${OVERLAY} > div`)).toHaveCSS(
      "transition-duration",
      "0s",
    );
    await expect(page.locator(`${OVERLAY} > div`)).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
    await expect(page.locator(CLONE)).toHaveCSS(
      "transform",
      "matrix(1, 0, 0, 1, 0, 0)",
    );
    await touch(page, 1, "touchmove", 60);
    await page.clock.runFor(250);
    await expect(page.locator(OVERLAY)).toHaveCSS("opacity", "1");
    await expect(page.locator(CLONE)).toHaveAttribute(
      "src",
      new URL("/gallery-review/thumb-b.svg", page.url()).href,
    );
    await testInfo.attach("controlled-overlap", {
      contentType: "application/json",
      body: JSON.stringify({
        interruption,
        interruptedAt,
        startedAt,
        paintedAt,
        advancedAfterStart: 250,
      }),
    });
  });
}

test("an earlier 600ms release cannot clear a new gesture on a different thumbnail", async ({
  page,
}, testInfo) => {
  await expand(page, 0);
  const firstCommitAt = await page.evaluate(() => Date.now());
  await touch(page, 0, "touchend");
  await page.clock.runFor(32);
  expect((await readState(page)).active).toBe(true);
  await closeGallery(page);
  await expand(page, 1);
  const secondStartedAt = await page.evaluate(() => Date.now());
  expect(secondStartedAt - firstCommitAt).toBeLessThan(180);
  expect((await readState(page)).active).toBe(true);
  await page.clock.runFor(650);
  const afterOldDeadline = await readState(page);
  await testInfo.attach("old-grace-deadline", {
    contentType: "application/json",
    body: JSON.stringify({ firstCommitAt, secondStartedAt, afterOldDeadline }),
  });
  expect(afterOldDeadline.active).toBe(true);
  await expect(page.locator(OVERLAY)).toHaveCSS("opacity", "1");
  await touch(page, 1, "touchend");
  await page.clock.runFor(599);
  expect((await readState(page)).active).toBe(true);
  await page.clock.runFor(1);
  expect((await readState(page)).active).toBe(false);
  await testInfo.attach("grace-timeline", {
    contentType: "application/json",
    body: JSON.stringify({
      firstCommitAt,
      secondStartedAt,
      activeAfterOldDeadline: true,
      ownReleaseAfter: 600,
    }),
  });
});

test("close and popstate while already closed preserve the active thumbnail gesture", async ({
  page,
}) => {
  await expand(page, 1);
  const before = await readState(page);
  expect(before.active).toBe(true);
  await page.evaluate(() =>
    window.dispatchEvent(new PopStateEvent("popstate")),
  );
  await page.clock.runFor(16);
  expect(await readState(page)).toEqual(before);
  await closeGallery(page);
  await page.clock.runFor(250);
  expect(await readState(page)).toEqual(before);
  await expect(page.locator(OVERLAY)).toHaveCSS("opacity", "1");
  await expect(page.locator(".yarl__portal")).toHaveCount(0);
});

test("close clears the seed and a subsequent tap opens at fit zoom", async ({
  page,
}) => {
  await expand(page, 0);
  await touch(page, 0, "touchend");
  await page.clock.runFor(32);
  expect((await readState(page)).zoom).toBeGreaterThan(1);
  await closeGallery(page);
  expect(await readState(page)).toEqual({
    active: false,
    zoom: 1,
    width: 0,
    panX: 0,
    panY: 0,
  });
  await page.clock.runFor(650);
  await page
    .locator("[data-gallery-image]")
    .nth(1)
    .evaluate((button) => {
      if (!(button instanceof HTMLButtonElement))
        throw new Error("thumbnail missing");
      button.click();
    });
  await page.clock.runFor(64);
  const fullsize = page.locator(".yarl__slide_current .yarl__fullsize");
  await expect(fullsize).toBeAttached();
  const scale = await fullsize.evaluate(
    (element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).a,
  );
  expect(scale).toBe(1);
  expect((await readState(page)).zoom).toBe(1);
});
