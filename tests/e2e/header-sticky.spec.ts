import { expect, test } from "@playwright/test";

// Regression guard: header must remain sticky (top=0) after scrolling.
// Failure mode: some ancestor getting overflow:hidden/clip or transform
// can break CSS `sticky` positioning, causing header to scroll away.

test.describe("Header sticky", () => {
  test("header stays at top of viewport after 500px scroll", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "load" });

    // Wait for the page to be interactive — habits section is a good anchor.
    await page.waitForSelector("[data-habit-item]", { timeout: 10_000 });

    // Scroll 500px down — enough to leave the hero but not necessarily reach habits.
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(200);

    const headerTop = await page.evaluate(() => {
      const header = document.querySelector("header");
      if (!header) return null;
      return header.getBoundingClientRect().top;
    });

    expect(headerTop).not.toBeNull();
    // Sticky header must be pinned at top of viewport: top >= 0 and < 10px.
    expect(headerTop as number).toBeGreaterThanOrEqual(0);
    expect(headerTop as number).toBeLessThan(10);
  });

  test("header stays at top after scrolling to bottom of page", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "load" });
    await page.waitForSelector("[data-habit-item]", { timeout: 10_000 });

    // Scroll all the way down.
    await page.evaluate(() =>
      window.scrollTo(0, document.body.scrollHeight),
    );
    await page.waitForTimeout(300);

    const headerTop = await page.evaluate(() => {
      const header = document.querySelector("header");
      if (!header) return null;
      return header.getBoundingClientRect().top;
    });

    expect(headerTop).not.toBeNull();
    expect(headerTop as number).toBeGreaterThanOrEqual(0);
    expect(headerTop as number).toBeLessThan(10);
  });
});
