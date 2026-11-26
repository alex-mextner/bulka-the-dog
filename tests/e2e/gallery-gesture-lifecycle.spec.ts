/**
 * Exercises thumbnail gesture listeners through the rendered page, without the
 * seed-zoom test hook. Interrupted handoffs must release their body-level clone
 * so closing or cancelling a gesture returns a usable page.
 */
import { expect, test, type Page } from "@playwright/test";

const THUMB = "[data-gallery-image]";
const TRANSITION = '[data-testid="pinch-transition-overlay"]';

async function freezeGestureTime(page: Page) {
  await page.clock.install({ time: new Date("2026-11-02T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-11-02T12:00:01Z"));
}

async function decodeOpeningImage(page: Page) {
  await page.clock.runFor(32);
  const image = page.locator(".yarl__slide_current .yarl__fullsize img");
  await expect(image).toBeAttached();
  await image.evaluate(async (element) => {
    if (!(element instanceof HTMLImageElement))
      throw new Error("slide image missing");
    await element.decode();
  });
  await page.clock.runFor(32);
}

async function startPinch(page: Page, scrollIntoView = true) {
  const thumbnail = page.locator(THUMB).first();
  if (scrollIntoView) await thumbnail.scrollIntoViewIfNeeded();
  await thumbnail.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const touches = [
      new Touch({
        identifier: 1,
        target: element,
        clientX: x - 30,
        clientY: y,
      }),
      new Touch({
        identifier: 2,
        target: element,
        clientX: x + 30,
        clientY: y,
      }),
    ];
    element.dispatchEvent(
      new TouchEvent("touchstart", {
        bubbles: true,
        cancelable: true,
        touches,
        targetTouches: touches,
        changedTouches: touches,
      }),
    );
  });
  await expect(page.locator(TRANSITION)).toBeVisible();
  await thumbnail.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const touches = [
      new Touch({
        identifier: 1,
        target: element,
        clientX: x - 60,
        clientY: y,
      }),
      new Touch({
        identifier: 2,
        target: element,
        clientX: x + 60,
        clientY: y,
      }),
    ];
    element.dispatchEvent(
      new TouchEvent("touchmove", {
        bubbles: true,
        cancelable: true,
        touches,
        targetTouches: touches,
        changedTouches: touches,
      }),
    );
  });
}

async function endPinch(page: Page, type: "touchend" | "touchcancel") {
  await page
    .locator(THUMB)
    .first()
    .evaluate((element, eventType) => {
      element.dispatchEvent(
        new TouchEvent(eventType, {
          bubbles: true,
          cancelable: true,
          touches: [],
          targetTouches: [],
          changedTouches: [],
        }),
      );
    }, type);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/?touch=1");
  await page
    .locator('[data-photo-strip][data-touch-mode="true"]')
    .first()
    .waitFor({ state: "attached" });
  await expect(page.locator(THUMB).first().locator("img")).toBeVisible();
});

test("touch cancellation aborts an expanded thumbnail instead of opening it", async ({
  page,
}, testInfo) => {
  const historyLength = await page.evaluate(() => history.length);
  await startPinch(page);
  await endPinch(page, "touchcancel");
  try {
    await expect(page.locator(TRANSITION)).toHaveCount(0, { timeout: 1_000 });
    await expect(page.locator(".yarl__portal")).toHaveCount(0);
    expect(await page.evaluate(() => history.length)).toBe(historyLength);
    await expect(page.locator("#root")).toBeVisible();
  } finally {
    await page.screenshot({ path: testInfo.outputPath("cancelled-pinch.png") });
  }
});

for (const closeMethod of ["Escape", "Back"] as const) {
  test(`${closeMethod} during handoff removes the clone and restores thumbnail focus`, async ({
    page,
  }, testInfo) => {
    await startPinch(page);
    await freezeGestureTime(page);
    const scrollY = await page.evaluate(() => window.scrollY);
    const committedAt = await page.evaluate(() => Date.now());
    await endPinch(page, "touchend");
    await decodeOpeningImage(page);
    await expect(page.locator(".yarl__portal")).toBeAttached();
    await expect(page.locator(TRANSITION)).toBeAttached();
    await expect(page.locator(TRANSITION)).toHaveCSS("opacity", "1");
    expect((await page.evaluate(() => Date.now())) - committedAt).toBe(64);
    if (closeMethod === "Back") {
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            window.addEventListener("popstate", () => resolve(), {
              once: true,
            });
            history.back();
          }),
      );
    } else {
      await page.keyboard.press("Escape");
    }
    await page.clock.runFor(650);
    try {
      await expect(page.locator(".yarl__portal")).toHaveCount(0);
      await expect(page.locator(TRANSITION)).toHaveCount(0, { timeout: 1_000 });
      await expect(
        page.locator('[data-testid="pinch-thumb-overlay"]'),
      ).toHaveCount(0);
      await expect(page.locator(THUMB).first()).toBeFocused();
      await expect(page.locator("#root")).toBeVisible();
      expect(
        Math.abs((await page.evaluate(() => window.scrollY)) - scrollY),
      ).toBeLessThanOrEqual(2);
    } finally {
      await page.screenshot({
        path: testInfo.outputPath("closed-handoff.png"),
      });
    }
    await page.clock.resume();
    await page.locator(THUMB).first().click();
    await expect(page.locator(".yarl__portal")).toBeAttached();
    const fullsize = page.locator(".yarl__slide_current .yarl__fullsize");
    await expect(fullsize).toBeAttached();
    await expect
      .poll(() =>
        fullsize.evaluate((element) => {
          const transform = new DOMMatrixReadOnly(
            getComputedStyle(element).transform,
          );
          return { scale: transform.a, x: transform.e, y: transform.f };
        }),
      )
      .toEqual({ scale: 1, x: 0, y: 0 });
  });
}

for (const interruption of ["close", "cancel"] as const) {
  test(`${interruption} cannot dismiss the next active pinch`, async ({
    page,
  }) => {
    await startPinch(page);
    await freezeGestureTime(page);
    const interruptedAt = await page.evaluate(() => Date.now());
    if (interruption === "close") {
      await endPinch(page, "touchend");
      await decodeOpeningImage(page);
      await expect(page.locator(".yarl__portal")).toBeAttached();
      await page.keyboard.press("Escape");
      await page.clock.runFor(400);
      await expect(page.locator("body")).not.toHaveClass(/yarl__no_scroll/);
    } else {
      await endPinch(page, "touchcancel");
    }
    await expect(page.locator(TRANSITION)).toBeAttached();
    await startPinch(page, false);
    await page.clock.runFor(32);
    const elapsed = (await page.evaluate(() => Date.now())) - interruptedAt;
    expect(elapsed).toBe(interruption === "close" ? 496 : 32);
    await expect(page.locator(TRANSITION)).toHaveCSS("opacity", "1");
    // Advance across both removal timers and the previous 600ms grace callback.
    await page.clock.runFor(650);
    await expect(page.locator(TRANSITION)).toBeVisible({ timeout: 1_000 });
    await expect(page.locator(TRANSITION)).toHaveCSS("opacity", "1");
    await endPinch(page, "touchcancel");
    await page.clock.runFor(220);
    await expect(page.locator(TRANSITION)).toHaveCount(0, { timeout: 1_000 });
    await expect(page.locator(".yarl__portal")).toHaveCount(0);
  });
}
