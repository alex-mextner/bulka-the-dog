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

test.describe("Header mobile layout", () => {
  test.use({
    viewport: { width: 320, height: 740 },
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
  });

  test("Android header does not inherit the Apple safe-area top gap", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "load" });
    await page.addStyleTag({
      content: ":root { --safe-area-top: 48px !important; }",
    });
    await page.waitForSelector("[data-habit-item]", { timeout: 10_000 });

    const metrics = await page.evaluate(() => {
      const header = document.querySelector("header") as HTMLElement | null;
      if (!header) return null;
      const rect = header.getBoundingClientRect();
      return {
        height: rect.height,
        paddingTop: parseFloat(window.getComputedStyle(header).paddingTop),
      };
    });

    expect(metrics, "header not found").not.toBeNull();
    expect(metrics!.paddingTop, "Android header should not add top safe-area padding").toBe(0);
    expect(metrics!.height, `Android header is too tall (${metrics!.height}px)`).toBeLessThanOrEqual(62);
  });

  test("header text remains single-line on a 320px phone", async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });
    await page.waitForSelector("[data-habit-item]", { timeout: 10_000 });
    await page.evaluate(() => {
      document.getElementById("habits")?.scrollIntoView({ block: "start" });
    });
    await page.waitForFunction(
      () =>
        Boolean(
          document.querySelector(
            'header button[aria-controls="mobile-nav"][aria-haspopup="true"]',
          ),
        ),
      { timeout: 3_000 },
    );

    const metrics = await page.evaluate(() => {
      const header = document.querySelector("header") as HTMLElement | null;
      if (!header) return null;
      const buttons = Array.from(header.querySelectorAll("button"));
      const brand = buttons.find((button) =>
        /Булка|Bulka/.test(button.textContent ?? ""),
      ) as HTMLElement | undefined;
      const activeChip = header.querySelector(
        'button[aria-controls="mobile-nav"][aria-haspopup="true"]',
      ) as HTMLElement | null;
      const measure = (el: HTMLElement | null | undefined) => {
        if (!el) return null;
        const styles = window.getComputedStyle(el);
        return {
          whiteSpace: styles.whiteSpace,
          clientHeight: el.clientHeight,
          scrollHeight: el.scrollHeight,
          text: el.textContent,
        };
      };
      return {
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        brand: measure(brand),
        activeChip: measure(activeChip),
      };
    });

    expect(metrics, "header not found").not.toBeNull();
    expect(metrics!.scrollWidth).toBeLessThanOrEqual(metrics!.innerWidth);
    expect(metrics!.brand, "brand button not found").not.toBeNull();
    expect(metrics!.brand!.whiteSpace).toBe("nowrap");
    expect(metrics!.brand!.scrollHeight).toBeLessThanOrEqual(
      metrics!.brand!.clientHeight + 2,
    );
    expect(metrics!.activeChip, "active section chip not found").not.toBeNull();
    expect(metrics!.activeChip!.whiteSpace).toBe("nowrap");
    expect(metrics!.activeChip!.scrollHeight).toBeLessThanOrEqual(
      metrics!.activeChip!.clientHeight + 2,
    );
  });
});
