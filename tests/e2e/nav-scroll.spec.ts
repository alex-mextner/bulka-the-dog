import { expect, test } from "@playwright/test";

// Bug repro: tapping a nav chip should jump near the target instantly,
// then ease in over the last stretch. On the current build a fresh
// page-load scroll feels fully smooth (no instant jump) and often
// misses the target because lazy-loaded images expand the page mid-
// flight without any settle correction.
//
// Tests stay against a FRESH page load — no pre-warm scroll-to-bottom —
// because that's the failure mode the user hits. Pre-warming hides
// lazy-load reflow.

test.describe("Nav chip scroll", () => {
  test("instant jump consumes >70% of distance within 200ms", async ({
    page,
  }) => {
    await page.goto("/?touch=1", { waitUntil: "load" });
    // Reach a state where the burger menu is visible (isScrolled true).
    await page.evaluate(() => window.scrollTo(0, 200));
    await page.waitForTimeout(100);

    const startY = await page.evaluate(() => window.scrollY);
    expect(startY).toBeGreaterThanOrEqual(150);

    // Open menu.
    await page.locator('[aria-label="Открыть меню"]').tap();
    await page.waitForTimeout(350);

    // Estimate target (gallery section, far end of page) before tap.
    const targetEstimate = await page.evaluate(() => {
      const el = document.getElementById("gallery");
      if (!el) return null;
      return el.getBoundingClientRect().top + window.scrollY - 72;
    });
    expect(targetEstimate).not.toBeNull();
    const totalDistance = (targetEstimate as number) - startY;
    expect(totalDistance).toBeGreaterThan(1000); // sanity: real long-haul scroll

    // Tap the "Photos" chip (last in the morphed nav list).
    const morphedNav = page.locator("#mobile-nav .flex.items-center.gap-2");
    const photosChip = morphedNav.locator("button", { hasText: /Фото|Photos|Slike/ }).first();
    // The chip might be off-screen in the horizontal nav scroller; bring it in.
    await photosChip.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => {});
    await photosChip.tap();

    // Sample scrollY at 50ms then at 200ms.
    await page.waitForTimeout(50);
    const yAt50 = await page.evaluate(() => window.scrollY);
    await page.waitForTimeout(150);
    const yAt200 = await page.evaluate(() => window.scrollY);

    // Phase-1 instant jump should have moved >=70% of the way to target
    // by t=200ms. A purely-smooth scroll covers ~30% of distance in 200ms.
    const consumedAt200 = yAt200 - startY;
    const fractionAt200 = consumedAt200 / totalDistance;
    console.log({ startY, yAt50, yAt200, totalDistance, fractionAt200 });
    expect(fractionAt200).toBeGreaterThan(0.7);
  });

  test("settles on the target section within tolerance after lazy-load shifts", async ({
    page,
  }) => {
    await page.goto("/?touch=1", { waitUntil: "load" });
    await page.evaluate(() => window.scrollTo(0, 200));
    await page.waitForTimeout(100);
    await page.locator('[aria-label="Открыть меню"]').tap();
    await page.waitForTimeout(350);
    const morphedNav = page.locator("#mobile-nav .flex.items-center.gap-2");
    const photosChip = morphedNav.locator("button", { hasText: /Фото|Photos|Slike/ }).first();
    await photosChip.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => {});
    await photosChip.tap();

    // Wait for phase 1 + 2 + 3 (settle loop runs 800ms + 6×250ms).
    await page.waitForTimeout(3500);

    const galleryTop = await page.evaluate(() => {
      const el = document.getElementById("gallery");
      if (!el) return null;
      return el.getBoundingClientRect().top;
    });
    expect(galleryTop).not.toBeNull();
    // Header is 72px, plus a small wiggle. Section's top edge should
    // sit between 0 and 100 from viewport top.
    expect(galleryTop as number).toBeGreaterThanOrEqual(0);
    expect(galleryTop as number).toBeLessThanOrEqual(100);
  });

  test("all 8 nav chips land their target within tolerance", async ({
    page,
  }) => {
    test.setTimeout(60_000); // 8 sections × ~3.5s each + overhead
    const sections = [
      "appearance",
      "habits",
      "skills",
      "health",
      "conditions",
      "faq",
      "contact",
      "gallery",
    ] as const;

    await page.goto("/?touch=1", { waitUntil: "load" });

    for (const id of sections) {
      // Re-open menu each time (it auto-closes on chip tap).
      await page.evaluate(() => window.scrollTo(0, 200));
      await page.waitForTimeout(80);
      await page.locator('[aria-label="Открыть меню"]').tap();
      await page.waitForTimeout(350);
      const idx = sections.indexOf(id);
      // Bring the chip into view via a JS click on it directly. We
      // avoid Playwright's `tap()` because the morphed-nav inner
      // horizontal scroller hides the chip outside its overflow window
      // for indices past ~3, and Playwright's auto-scroll-into-view
      // logic doesn't traverse our overflow-x-auto container reliably.
      // Calling .click() via DOM bypasses the visibility check entirely
      // — the production handler doesn't care whether the click came
      // from a real tap or a programmatic invocation, it just does the
      // scrollIntoView dance.
      const clicked = await page.evaluate((index) => {
        const row = document.querySelector(
          "#mobile-nav .flex.items-center.gap-2",
        ) as HTMLElement | null;
        if (!row) return false;
        const btn = row.children[index];
        if (!(btn instanceof HTMLElement)) return false;
        btn.click();
        return true;
      }, idx);
      expect(clicked, `chip ${id} not laid out`).toBe(true);
      await page.waitForTimeout(3500);
      const top = await page.evaluate((sid) => {
        const el = document.getElementById(sid);
        if (!el) return Infinity;
        return el.getBoundingClientRect().top;
      }, id);
      expect(
        top,
        `section #${id} should be near top, got ${top}`,
      ).toBeGreaterThanOrEqual(-10);
      expect(top, `section #${id} should be near top, got ${top}`).toBeLessThanOrEqual(120);
    }
  });
});
