import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

// Tests targeting the "grey strip at bottom" symptom seen intermittently on
// iOS Safari after repeated scrolls and menu navigation.
//
// Root causes we're guarding against:
//   1. Transparent background on body / #root / page-shell lets the UA canvas
//      bleed through rubber-band overscroll zones.
//   2. overscroll-behavior is accidentally removed from html or body, re-enabling
//      Safari's rubber-band bounce which reveals the raw document canvas.
//   3. State leakage from burger menu open/close leaves overflow:hidden on body.
//   4. State leakage from lightbox open/close leaves yarl__no_scroll or black
//      body background, making #root permanently invisible or body incorrectly styled.
//
// NOTE: Playwright (Chromium) cannot reproduce the actual iOS rubber-band
// overscroll — it has no address bar and no UA chrome compositing. These tests
// verify the structural fixes are *present* and that no state mutation leaks
// after repeated interaction. Real device verification is required for visual
// confirmation.

// ── Computed-style regression: backgrounds and overscroll ────────────────────

test.describe("Page canvas background chain (grey strip prevention)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });
  });

  test("body has non-transparent background colour", async ({ page }) => {
    const bg = await page.evaluate(
      () => window.getComputedStyle(document.body).backgroundColor,
    );
    expect(
      bg,
      `body background should be explicitly set (not transparent), got: ${bg}`,
    ).not.toBe("rgba(0, 0, 0, 0)");
    expect(
      bg,
      `body background should not be bare white UA default, got: ${bg}`,
    ).not.toBe("rgb(255, 255, 255)");
  });

  test("#root has non-transparent background colour", async ({ page }) => {
    const bg = await page.evaluate(() => {
      const root = document.getElementById("root");
      if (!root) return null;
      return window.getComputedStyle(root).backgroundColor;
    });
    expect(bg, "#root not found").not.toBeNull();
    expect(
      bg,
      `#root background should be explicitly set (not transparent), got: ${bg}`,
    ).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("page shell (main's parent div) has non-transparent background colour", async ({
    page,
  }) => {
    const bg = await page.evaluate(() => {
      const pageShell = document.querySelector("main")
        ?.parentElement as HTMLElement | null;
      if (!pageShell) return null;
      return window.getComputedStyle(pageShell).backgroundColor;
    });
    expect(bg, "page shell not found").not.toBeNull();
    expect(
      bg,
      `page shell background should be explicitly set (not transparent), got: ${bg}`,
    ).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("footer has non-transparent background colour", async ({ page }) => {
    const bg = await page.evaluate(() => {
      const footer = document.querySelector("footer");
      if (!footer) return null;
      return window.getComputedStyle(footer).backgroundColor;
    });
    expect(bg, "footer not found").not.toBeNull();
    expect(
      bg,
      `footer background should be explicitly set (not transparent), got: ${bg}`,
    ).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("html has overscroll-behavior: none (prevents rubber-band canvas reveal)", async ({
    page,
  }) => {
    const val = await page.evaluate(
      () =>
        window.getComputedStyle(document.documentElement).overscrollBehavior,
    );
    expect(
      val,
      `html overscroll-behavior should be 'none' (got '${val}') — rubber-band overscroll will reveal the document canvas`,
    ).toBe("none");
  });

  test("body has overscroll-behavior: none (prevents rubber-band canvas reveal)", async ({
    page,
  }) => {
    const val = await page.evaluate(
      () => window.getComputedStyle(document.body).overscrollBehavior,
    );
    expect(
      val,
      `body overscroll-behavior should be 'none' (got '${val}') — rubber-band overscroll will reveal the document canvas`,
    ).toBe("none");
  });
});

// ── Scroll stress test: no state leakage after repeated scroll + nav ─────────

test.describe("Scroll stress: no state leakage after scroll and menu nav", () => {
  test("html/body retain correct styles after repeated scrolls and burger menu open/close", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "load" });

    // Scroll to the bottom and back three times to stress the layout.
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() =>
        window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }),
      );
      await page.waitForTimeout(80);
      await page.evaluate(() =>
        window.scrollTo({ top: 0, behavior: "instant" }),
      );
      await page.waitForTimeout(80);
    }

    // Scroll past the header collapse threshold so the burger menu button appears.
    await page.evaluate(() =>
      window.scrollTo({ top: 200, behavior: "instant" }),
    );
    await page.waitForTimeout(150);

    // Open the burger menu.
    const burgerOpen = page.getByRole("button", { name: "Открыть меню" });
    await burgerOpen.waitFor({ state: "visible", timeout: 3_000 });
    await burgerOpen.tap();
    await page.waitForTimeout(100);

    // Tap a nav chip inside the mobile nav.
    const mobileNav = page.locator("#mobile-nav");
    await mobileNav.waitFor({ state: "visible", timeout: 3_000 });
    const firstChip = mobileNav.locator("button").first();
    await firstChip.tap();
    await page.waitForTimeout(200);

    // Open the burger again and close it.
    const burgerOpen2 = page.getByRole("button", { name: "Открыть меню" });
    await expect(burgerOpen2).toBeVisible({ timeout: 2_000 });
    await burgerOpen2.tap();
    await page.waitForTimeout(100);
    const burgerClose = page.getByRole("button", { name: "Закрыть меню" });
    await expect(burgerClose).toBeVisible({ timeout: 2_000 });
    await burgerClose.tap();
    await page.waitForTimeout(100);

    // After all interactions, verify no state leakage on body.
    const state = await page.evaluate(() => {
      const bodyClasses = document.body.className;
      const bodyOverflow = window.getComputedStyle(document.body).overflow;
      const htmlOverscroll = window.getComputedStyle(
        document.documentElement,
      ).overscrollBehavior;
      const bodyOverscroll =
        window.getComputedStyle(document.body).overscrollBehavior;
      const bodyBg = window.getComputedStyle(document.body).backgroundColor;
      const rootBg = (() => {
        const root = document.getElementById("root");
        return root ? window.getComputedStyle(root).backgroundColor : null;
      })();
      return {
        bodyClasses,
        bodyOverflow,
        htmlOverscroll,
        bodyOverscroll,
        bodyBg,
        rootBg,
      };
    });

    // yarl__no_scroll must not be present on body outside a lightbox session.
    expect(
      state.bodyClasses,
      "body must not have yarl__no_scroll after menu interaction",
    ).not.toContain("yarl__no_scroll");

    // body overflow must not be clipped/hidden (would shorten the page).
    expect(
      state.bodyOverflow,
      `body overflow should not be 'hidden' after menu interaction (got '${state.bodyOverflow}')`,
    ).not.toBe("hidden");

    // overscroll-behavior must remain intact.
    expect(
      state.htmlOverscroll,
      `html overscroll-behavior must still be 'none' after interaction (got '${state.htmlOverscroll}')`,
    ).toBe("none");
    expect(
      state.bodyOverscroll,
      `body overscroll-behavior must still be 'none' after interaction (got '${state.bodyOverscroll}')`,
    ).toBe("none");

    // Backgrounds must remain non-transparent.
    expect(
      state.bodyBg,
      `body background must remain set after interaction (got '${state.bodyBg}')`,
    ).not.toBe("rgba(0, 0, 0, 0)");
    expect(
      state.rootBg,
      `#root background must remain set after interaction (got '${state.rootBg}')`,
    ).not.toBe("rgba(0, 0, 0, 0)");
  });
});

// ── Lightbox lifecycle stress: no state leakage after open/close ──────────────

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

async function tapFirstPhoto(page: Page) {
  const clicked = await page.evaluate(() => {
    const btn = document.querySelector(
      "[data-photo-strip] div.flex.flex-nowrap button",
    );
    if (!(btn instanceof HTMLElement)) return false;
    btn.click();
    return true;
  });
  expect(clicked, "no photo button found").toBe(true);
}

test.describe("Lightbox lifecycle stress: no state leakage after open/close", () => {
  test("body retains correct styles after lightbox open/close cycle", async ({
    page,
  }) => {
    await page.goto("/?touch=1", { waitUntil: "load" });
    await waitForGalleryReady(page);

    // Open the lightbox.
    await tapFirstPhoto(page);
    await page
      .locator(".yarl__portal")
      .waitFor({ state: "attached", timeout: 5_000 });
    await page.waitForTimeout(100);

    // Close via Escape.
    await page.keyboard.press("Escape");
    await page
      .locator(".yarl__portal")
      .waitFor({ state: "detached", timeout: 5_000 });
    await page.waitForTimeout(100);

    const state = await page.evaluate(() => {
      const bodyClasses = document.body.className;
      const bodyOverflow = window.getComputedStyle(document.body).overflow;
      const bodyBg = window.getComputedStyle(document.body).backgroundColor;
      const rootVisibility = (() => {
        const root = document.getElementById("root");
        return root ? window.getComputedStyle(root).visibility : null;
      })();
      return { bodyClasses, bodyOverflow, bodyBg, rootVisibility };
    });

    // yarl__no_scroll must be gone after close.
    expect(
      state.bodyClasses,
      "body must not have yarl__no_scroll after lightbox closes",
    ).not.toContain("yarl__no_scroll");

    // body overflow must not be stuck as hidden (would clip the page).
    expect(
      state.bodyOverflow,
      `body overflow should not be 'hidden' after lightbox close (got '${state.bodyOverflow}')`,
    ).not.toBe("hidden");

    // body background must be the page colour, not black from the modal state.
    expect(
      state.bodyBg,
      `body background must not be black after lightbox close (got '${state.bodyBg}')`,
    ).not.toBe("rgb(0, 0, 0)");

    // #root must be visible again.
    expect(
      state.rootVisibility,
      `#root must be visible after lightbox close (got '${state.rootVisibility}')`,
    ).toBe("visible");
  });

  // Regression for the pre-mount popstate race: open() eagerly adds
  // yarl__no_scroll before setIsOpen(true) so YARL's NoScroll effect is
  // already in effect on the first paint.  If popstate fires before that
  // first render commits (Android back arriving very quickly), close() must
  // remove the class synchronously — YARL's own cleanup never runs because
  // isOpen goes false before YARL mounts.
  //
  // We exercise this deterministically by dispatching a synchronous PopStateEvent
  // inside the same evaluate() as the click, before React has had a chance to
  // flush the setIsOpen(true) update.
  test("yarl__no_scroll is removed when popstate fires before YARL portal mounts", async ({
    page,
  }) => {
    await page.goto("/?touch=1", { waitUntil: "load" });
    await waitForGalleryReady(page);

    // Click the first photo button AND immediately fire a synchronous popstate,
    // all in one evaluate so React has not yet committed the isOpen=true render.
    const triggered = await page.evaluate(() => {
      const btn = document.querySelector(
        "[data-photo-strip] div.flex.flex-nowrap button",
      );
      if (!(btn instanceof HTMLElement)) return false;
      // open(): adds yarl__no_scroll, queues setIsOpen(true), pushes history.
      btn.click();
      // dispatchEvent is synchronous — fires before React flushes the update.
      window.dispatchEvent(new PopStateEvent("popstate"));
      return true;
    });
    expect(triggered, "no photo button found").toBe(true);

    // Allow React to flush both setIsOpen(true) and setIsOpen(false).
    await page.waitForTimeout(200);

    const state = await page.evaluate(() => {
      const bodyClasses = document.body.className;
      const rootVisibility = (() => {
        const root = document.getElementById("root");
        return root ? window.getComputedStyle(root).visibility : null;
      })();
      return { bodyClasses, rootVisibility };
    });

    expect(
      state.bodyClasses,
      "yarl__no_scroll must not be stuck after pre-mount popstate closes the lightbox",
    ).not.toContain("yarl__no_scroll");

    expect(
      state.rootVisibility,
      `#root must be visible after pre-mount popstate close (got '${state.rootVisibility}')`,
    ).toBe("visible");
  });
});
