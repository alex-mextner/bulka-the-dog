import { expect, test } from "@playwright/test";

// Habits scrollytelling — sticky photo tests.
//
// Mobile: two low photos in a fixed bottom bar with an in-flow spacer.
// Desktop: two stacked photos on left, sticky top = 6rem (top-24).

const DESKTOP_STICKY_TOP = 96; // top-24 = 96px

async function scrollPastHabitsHeading(page: import("@playwright/test").Page, extraPx = 300) {
  // Scroll so the habits heading leaves the viewport and we're mid-section.
  await page.evaluate((extra) => {
    const heading = document.getElementById("habits-title");
    if (!heading) return;
    const rect = heading.getBoundingClientRect();
    window.scrollBy(0, rect.bottom + extra);
  }, extraPx);
  await page.waitForTimeout(150);
}

test.describe("Habits sticky photo — mobile", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });
    await page.waitForSelector("[data-habit-item]", { timeout: 10_000 });
  });

  test("mobile photo bar stays hidden for the bathroom item", async ({ page }) => {
    await page.evaluate(() => {
      const items = document.querySelectorAll<HTMLElement>("[data-habit-item]");
      const bar = document.querySelector<HTMLElement>("[data-mobile-photo-stick]");
      if (!bar || !items[0]) return;
      const headerBottom = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
      const readingLine = Math.max(headerBottom + 120, Math.min(window.innerHeight - 280, window.innerHeight * 0.45));
      const rect = items[0].getBoundingClientRect();
      window.scrollTo({
        top: Math.max(0, window.scrollY + rect.top - readingLine),
        behavior: "instant",
      });
    });
    await page.waitForTimeout(250);

    const state = await page.evaluate(() => {
      const bar = document.querySelector("[data-mobile-photo-stick]") as HTMLElement | null;
      if (!bar) return null;
      const styles = window.getComputedStyle(bar);
      return {
        opacity: parseFloat(styles.opacity),
        pointerEvents: styles.pointerEvents,
      };
    });

    expect(state, "mobile photo bar not found").not.toBeNull();
    expect(state!.opacity, "bathroom item should not show photos").toBeLessThan(0.05);
    expect(state!.pointerEvents).toBe("none");
  });

  test("mobile photo bar stays hidden for the food item", async ({ page }) => {
    await page.evaluate(() => {
      const items = document.querySelectorAll<HTMLElement>("[data-habit-item]");
      const bar = document.querySelector<HTMLElement>("[data-mobile-photo-stick]");
      if (!bar || !items[5]) return;
      const headerBottom = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
      const readingLine = Math.max(headerBottom + 120, Math.min(window.innerHeight - 280, window.innerHeight * 0.45));
      const rect = items[5].getBoundingClientRect();
      window.scrollTo({
        top: Math.max(0, window.scrollY + rect.top - readingLine),
        behavior: "instant",
      });
    });
    await page.waitForTimeout(250);

    const state = await page.evaluate(() => {
      const bar = document.querySelector("[data-mobile-photo-stick]") as HTMLElement | null;
      if (!bar) return null;
      const styles = window.getComputedStyle(bar);
      return {
        opacity: parseFloat(styles.opacity),
        pointerEvents: styles.pointerEvents,
      };
    });

    expect(state, "mobile photo bar not found").not.toBeNull();
    expect(state!.opacity, "food item should not show photos").toBeLessThan(0.05);
    expect(state!.pointerEvents).toBe("none");
  });

  test("mobile sticky photo bar is pinned to the bottom", async ({ page }) => {
    await page.evaluate(() => {
      const items = document.querySelectorAll<HTMLElement>("[data-habit-item]");
      const bar = document.querySelector<HTMLElement>("[data-mobile-photo-stick]");
      if (!bar || !items[1]) return;
      const headerBottom = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
      const readingLine = Math.max(headerBottom + 120, Math.min(window.innerHeight - 280, window.innerHeight * 0.45));
      const rect = items[1].getBoundingClientRect();
      window.scrollTo({
        top: Math.max(0, window.scrollY + rect.top - readingLine),
        behavior: "instant",
      });
    });
    await page.waitForFunction(
      () => {
        const bar = document.querySelector("[data-mobile-photo-stick]");
        return Boolean(bar && parseFloat(window.getComputedStyle(bar).opacity) > 0.9);
      },
      undefined,
      { timeout: 3_000 },
    );

    const metrics = await page.evaluate(() => {
      const container = document.querySelector(
        "[data-mobile-photo-stick]",
      ) as HTMLElement | null;
      const spacer = document.querySelector(
        "[data-mobile-photo-spacer]",
      ) as HTMLElement | null;
      if (!container) return null;
      const rect = container.getBoundingClientRect();
      const spacerRect = spacer?.getBoundingClientRect();
      const styles = window.getComputedStyle(container);
      return {
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
        spacerHeight: spacerRect?.height ?? 0,
        viewportHeight: window.innerHeight,
        opacity: parseFloat(styles.opacity),
        position: styles.position,
        computedBottom: styles.bottom,
      };
    });

    expect(metrics, "mobile sticky photo bar not found").not.toBeNull();
    expect(metrics!.opacity, "walks item should show photos").toBeGreaterThan(0.9);
    expect(metrics!.position, "expected position:fixed").toBe("fixed");
    expect(metrics!.computedBottom, "bottom should not be auto").not.toBe("auto");
    expect(parseFloat(metrics!.computedBottom), "expected bottom:0").toBe(0);
    expect(
      metrics!.bottom,
      `sticky bar should sit at viewport bottom, got bottom=${metrics!.bottom}`,
    ).toBeGreaterThanOrEqual(metrics!.viewportHeight - 2);
    expect(
      metrics!.top,
      `sticky bar should be near the bottom, got top=${metrics!.top}`,
    ).toBeGreaterThan(metrics!.viewportHeight - 180);
    expect(
      metrics!.height,
      `sticky bar is too tall (${metrics!.height}px)`,
    ).toBeLessThanOrEqual(150);
    expect(
      Math.abs(metrics!.spacerHeight - metrics!.height),
      `reserved spacer (${metrics!.spacerHeight}px) should match fixed bar (${metrics!.height}px)`,
    ).toBeLessThanOrEqual(2);
  });

  test("mobile sticky bar contains two horizontal low photos", async ({ page }) => {
    // Scroll to the middle of the habit items — the 4th item.
    await page.evaluate(() => {
      const items = document.querySelectorAll("[data-habit-item]");
      items[3]?.scrollIntoView({ block: "center" });
    });
    await page.waitForTimeout(150);

    const buttons = await page.evaluate(() => {
      const container = document.querySelector(
        "[data-mobile-photo-stick]",
      ) as HTMLElement | null;
      if (!container) return null;
      return Array.from(container.querySelectorAll("button")).map((button) => {
        const rect = button.getBoundingClientRect();
        return {
          top: rect.top,
          left: rect.left,
          right: rect.right,
          width: rect.width,
          height: rect.height,
        };
      });
    });

    expect(buttons, "photo buttons not found").not.toBeNull();
    expect(buttons!.length, "expected two mobile sticky photos").toBe(2);
    const [first, second] = buttons!;
    expect(
      Math.abs(first.top - second.top),
      `photos should share one row, got tops ${first.top} and ${second.top}`,
    ).toBeLessThan(4);
    expect(second.left, "second photo should be to the right").toBeGreaterThan(
      first.right,
    );
    expect(first.height, `first photo is too tall (${first.height}px)`).toBeLessThanOrEqual(120);
    expect(
      second.height,
      `second photo is too tall (${second.height}px)`,
    ).toBeLessThanOrEqual(120);
  });

  test("mobile sticky photo bar has opaque background", async ({
    page,
  }) => {
    const bg = await page.evaluate(() => {
      const el = document.querySelector(
        "[data-mobile-photo-stick]",
      ) as HTMLElement | null;
      if (!el) return null;
      return window.getComputedStyle(el).backgroundColor;
    });
    expect(bg, "element not found").not.toBeNull();
    expect(
      bg,
      `sticky bar background is transparent ('${bg}')`,
    ).not.toBe("rgba(0, 0, 0, 0)");
    expect(bg, "sticky bar background must not be 'transparent'").not.toBe(
      "transparent",
    );
  });

  test("mobile fixed photo bar does not drift during slow entry and exit", async ({ page }) => {
    const samples = await page.evaluate(async () => {
      const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
      const habits = document.getElementById("habits");
      const skills = document.getElementById("skills");
      const bar = document.querySelector("[data-mobile-photo-stick]") as HTMLElement | null;
      if (!habits || !skills || !bar) return null;

      const read = () => {
        const rect = bar.getBoundingClientRect();
        const styles = window.getComputedStyle(bar);
        return {
          top: rect.top,
          bottom: rect.bottom,
          opacity: parseFloat(styles.opacity),
          transform: styles.transform,
        };
      };

      const habitsTop =
        window.scrollY + habits.getBoundingClientRect().top - window.innerHeight + 260;
      const skillsTop =
        window.scrollY + skills.getBoundingClientRect().top - window.innerHeight - 260;

      const rows: ReturnType<typeof read>[] = [];
      for (const start of [habitsTop, skillsTop]) {
        window.scrollTo(0, Math.max(0, start));
        await wait(180);
        for (let i = 0; i < 12; i++) {
          window.scrollBy(0, 60);
          await wait(50);
          rows.push(read());
        }
      }
      return rows;
    });

    expect(samples, "could not sample mobile fixed photo bar").not.toBeNull();
    const visible = samples!.filter((sample) => sample.opacity > 0.05);
    expect(visible.length, "bar never became visible").toBeGreaterThan(0);
    for (const sample of visible) {
      expect(sample.transform, "bar should fade only, not translate").toBe("none");
      expect(Math.round(sample.bottom), "bar should stay pinned to viewport bottom").toBe(844);
    }
    const tops = visible.map((sample) => Math.round(sample.top));
    expect(
      Math.max(...tops) - Math.min(...tops),
      `bar top drifted during slow scroll: ${tops.join(", ")}`,
    ).toBeLessThanOrEqual(1);
  });
});

test.describe("Habits sticky photo — desktop", () => {
  test.use({
    viewport: { width: 1280, height: 800 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });
    await page.waitForSelector("[data-habit-item]", { timeout: 10_000 });
  });

  test("desktop sticky photo column has position:sticky in computed style", async ({ page }) => {
    const pos = await page.evaluate(() => {
      const el = document.querySelector("[data-desktop-photo-stick]") as HTMLElement | null;
      if (!el) return null;
      return window.getComputedStyle(el).position;
    });
    expect(pos, "desktop sticky column not found").not.toBeNull();
    expect(pos, "expected position:sticky").toBe("sticky");
  });

  test("desktop sticky column stays at threshold while scrolling mid-section", async ({ page }) => {
    await scrollPastHabitsHeading(page, 300);

    const top = await page.evaluate(() => {
      const el = document.querySelector("[data-desktop-photo-stick]") as HTMLElement | null;
      if (!el) return null;
      return el.getBoundingClientRect().top;
    });

    expect(top, "desktop sticky column not found").not.toBeNull();
    // Should be at roughly DESKTOP_STICKY_TOP (96px) when stuck.
    expect(top!, `sticky column scrolled away (top=${top})`).toBeGreaterThan(0);
    expect(top!, `sticky column above threshold (top=${top})`).toBeLessThan(
      DESKTOP_STICKY_TOP + 30,
    );
  });

  test("desktop sticky photos are clearly shorter than text items column", async ({ page }) => {
    // For sticky to be noticeable, the sticky column must be shorter than the
    // text column. If they're similar height, scroll range is too small to notice.
    const heights = await page.evaluate(() => {
      const stickyCol = document.querySelector("[data-desktop-photo-stick]") as HTMLElement | null;
      const itemsCol = document.querySelector("[data-habit-item]")?.parentElement as HTMLElement | null;
      if (!stickyCol || !itemsCol) return null;
      return {
        sticky: stickyCol.getBoundingClientRect().height,
        items: itemsCol.getBoundingClientRect().height,
      };
    });

    expect(heights, "could not measure column heights").not.toBeNull();
    // Sticky column should be at least 200px shorter than items column so
    // the sticky travel is meaningful.
    const diff = heights!.items - heights!.sticky;
    expect(
      diff,
      `sticky column (${heights!.sticky}px) too close in height to items column (${heights!.items}px); diff=${diff}px; need ≥200px for sticky to be noticeable`,
    ).toBeGreaterThanOrEqual(200);
  });
});

// ── Bug 2: habitsActiveIdx must match the habit item currently in reading position ──
// The "max visible pixels" algorithm picks the LONGEST item in view, not the one
// the user is actually reading. "In the car" (idx=3) is short, so when it and
// "At home" (idx=4, bulka_tv) overlap in the visible area, bulka_tv can win.
test.describe("Habits photo — correct active index (mobile)", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });
    await page.waitForSelector("[data-habit-item]", { timeout: 10_000 });
  });

  // Scroll so the 4th habit item (🚗 car, idx=3) sits at the reading line
  // just above the bottom photo bar — then the primary visible photo must be
  // bulka_car_walk, NOT bulka_tv (which is the next longer item).
  test("car item (idx=3) triggers car-walk photo, not bulka_tv", async ({ page }) => {
    // Step 1: scroll into habits section so the sticky bottom photo bar is active.
    await page.evaluate(() => {
      const heading = document.getElementById("habits-title");
      if (heading) window.scrollBy(0, heading.getBoundingClientRect().bottom + 50);
    });
    await page.waitForTimeout(150);

    // Pre-condition: bulka_car_walk must NOT be visible yet after the initial scroll.
    // If it is already visible here, waitForFunction below would resolve
    // immediately on stale state and the test would false-pass even if the
    // "item[3] at reading position → bulka_car_walk" logic regressed.
    const srcBeforeStep2 = await page.evaluate(() => {
      const container = document.querySelector(
        "[data-mobile-photo-stick]",
      ) as HTMLElement | null;
      if (!container) return null;
      const primary = container.querySelector("button");
      if (!primary) return null;
      const imgs = Array.from(primary.querySelectorAll("img"));
      for (const img of imgs) {
        if ((img as HTMLImageElement).style.opacity === "1")
          return (img as HTMLImageElement).src;
      }
      return null;
    });
    expect(
      srcBeforeStep2,
      "bulka_car_walk must not already be visible before scroll-to-item[3] — " +
        "if it is, the waitForFunction below tests nothing",
    ).not.toContain("bulka_car_walk");

    // Step 2: place item[3].top at the same reading line used by Index.tsx:
    // just above the bottom sticky bar.
    await page.evaluate(() => {
      const items = document.querySelectorAll<HTMLElement>("[data-habit-item]");
      const sticky = document.querySelector<HTMLElement>("[data-mobile-photo-stick]");
      if (!sticky || !items[3]) return;
      const headerBottom = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
      const readingLine = Math.max(headerBottom + 120, Math.min(window.innerHeight - 280, window.innerHeight * 0.45));
      const item = items[3];
      const rect = item.getBoundingClientRect();
      const targetScrollY = window.scrollY + rect.top - readingLine;
      window.scrollTo({ top: Math.max(0, targetScrollY), behavior: "instant" });
    });

    // Wait for scroll handlers + photo fade to settle. Poll instead of a
    // fixed timeout so the test doesn't flake under load in a full suite run.
    await page.waitForFunction(
      () => {
        const container = document.querySelector("[data-mobile-photo-stick]");
        if (!container) return false;
        if (parseFloat(window.getComputedStyle(container).opacity) < 0.9) return false;
        const primary = container.querySelector("button");
        if (!primary) return false;
        const imgs = Array.from(primary.querySelectorAll("img")) as HTMLImageElement[];
        // Resolve as soon as bulka_car_walk is the visible photo.
        return imgs.some(
          (img) => img.style.opacity === "1" && img.src.includes("bulka_car_walk"),
        );
      },
      undefined,
      { timeout: 3_000 },
    ).catch(() => {
      // If we time out, fall through — the assertion below will report the
      // actual visible src so the failure is readable.
    });

    const visibleSrc = await page.evaluate(() => {
      // Find the visible img inside the primary MOBILE sticky photo.
      const container = document.querySelector("[data-mobile-photo-stick]") as HTMLElement | null;
      if (!container) return null;
      const primary = container.querySelector("button");
      if (!primary) return null;
      const imgs = Array.from(primary.querySelectorAll("img"));
      for (const img of imgs) {
        if (img.style.opacity === "1") return img.src;
      }
      return null;
    });

    expect(visibleSrc, "no visible photo found in sticky container").not.toBeNull();
    expect(
      visibleSrc!,
      `expected bulka_car_walk photo when car item is at reading position, got: ${visibleSrc}`,
    ).toContain("bulka_car_walk");
  });

  test("cats item uses a home-with-cats secondary photo, not a dog-walk photo", async ({ page }) => {
    await page.evaluate(() => {
      const heading = document.getElementById("habits-title");
      if (heading) window.scrollBy(0, heading.getBoundingClientRect().bottom + 50);
    });
    await page.waitForTimeout(150);

    await page.evaluate(() => {
      const items = document.querySelectorAll<HTMLElement>("[data-habit-item]");
      const bar = document.querySelector<HTMLElement>("[data-mobile-photo-stick]");
      if (!bar || !items[6]) return;
      const headerBottom = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
      const readingLine = Math.max(headerBottom + 120, Math.min(window.innerHeight - 280, window.innerHeight * 0.45));
      const rect = items[6].getBoundingClientRect();
      window.scrollTo({
        top: Math.max(0, window.scrollY + rect.top - readingLine),
        behavior: "instant",
      });
    });

    await page.waitForFunction(
      () => {
        const bar = document.querySelector("[data-mobile-photo-stick]");
        if (!bar || parseFloat(window.getComputedStyle(bar).opacity) < 0.9) return false;
        const buttons = Array.from(bar?.querySelectorAll("button") ?? []);
        const secondary = buttons[1];
        if (!secondary) return false;
        return Array.from(secondary.querySelectorAll("img")).some(
          (img) =>
            img instanceof HTMLImageElement &&
            img.style.opacity === "1" &&
            img.src.includes("dog_home"),
        );
      },
      undefined,
      { timeout: 3_000 },
    );

    const secondarySrc = await page.evaluate(() => {
      const bar = document.querySelector("[data-mobile-photo-stick]");
      const secondary = bar?.querySelectorAll("button")[1];
      if (!secondary) return null;
      const imgs = Array.from(secondary.querySelectorAll("img"));
      for (const img of imgs) {
        if (img.style.opacity === "1") return img.src;
      }
      return null;
    });

    expect(secondarySrc, "no visible secondary cats photo found").not.toBeNull();
    expect(secondarySrc!).toContain("dog_home");
    expect(secondarySrc!).not.toContain("dogs_public");
  });

  test("home item uses a home photo without cats as secondary", async ({ page }) => {
    await page.evaluate(() => {
      const heading = document.getElementById("habits-title");
      if (heading) window.scrollBy(0, heading.getBoundingClientRect().bottom + 50);
    });
    await page.waitForTimeout(150);

    await page.evaluate(() => {
      const items = document.querySelectorAll<HTMLElement>("[data-habit-item]");
      const bar = document.querySelector<HTMLElement>("[data-mobile-photo-stick]");
      if (!bar || !items[4]) return;
      const headerBottom = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
      const readingLine = Math.max(headerBottom + 120, Math.min(window.innerHeight - 280, window.innerHeight * 0.45));
      const rect = items[4].getBoundingClientRect();
      window.scrollTo({
        top: Math.max(0, window.scrollY + rect.top - readingLine),
        behavior: "instant",
      });
    });

    await page.waitForFunction(
      () => {
        const bar = document.querySelector("[data-mobile-photo-stick]");
        if (!bar || parseFloat(window.getComputedStyle(bar).opacity) < 0.9) return false;
        const secondary = bar.querySelectorAll("button")[1];
        if (!secondary) return false;
        return Array.from(secondary.querySelectorAll("img")).some(
          (img) =>
            img instanceof HTMLImageElement &&
            img.style.opacity === "1" &&
            img.src.includes("ps_balcony_sun"),
        );
      },
      undefined,
      { timeout: 3_000 },
    );

    const secondarySrc = await page.evaluate(() => {
      const bar = document.querySelector("[data-mobile-photo-stick]");
      const secondary = bar?.querySelectorAll("button")[1];
      if (!secondary) return null;
      const imgs = Array.from(secondary.querySelectorAll("img"));
      for (const img of imgs) {
        if (img.style.opacity === "1") return img.src;
      }
      return null;
    });

    expect(secondarySrc, "no visible secondary home photo found").not.toBeNull();
    expect(secondarySrc!).toContain("ps_balcony_sun");
    expect(secondarySrc!).not.toContain("dog_home");
  });

  test("walks item uses a dog-walk secondary photo, not a home photo", async ({ page }) => {
    await page.evaluate(() => {
      const items = document.querySelectorAll<HTMLElement>("[data-habit-item]");
      const bar = document.querySelector<HTMLElement>("[data-mobile-photo-stick]");
      if (!bar || !items[1]) return;
      const headerBottom = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
      const readingLine = Math.max(headerBottom + 120, Math.min(window.innerHeight - 280, window.innerHeight * 0.45));
      const rect = items[1].getBoundingClientRect();
      window.scrollTo({
        top: Math.max(0, window.scrollY + rect.top - readingLine),
        behavior: "instant",
      });
    });

    await page.waitForFunction(
      () => {
        const bar = document.querySelector("[data-mobile-photo-stick]");
        if (!bar || parseFloat(window.getComputedStyle(bar).opacity) < 0.9) return false;
        const secondary = bar.querySelectorAll("button")[1];
        if (!secondary) return false;
        return Array.from(secondary.querySelectorAll("img")).some(
          (img) =>
            img instanceof HTMLImageElement &&
            img.style.opacity === "1" &&
            img.src.includes("dogs_public"),
        );
      },
      undefined,
      { timeout: 3_000 },
    );

    const secondarySrc = await page.evaluate(() => {
      const bar = document.querySelector("[data-mobile-photo-stick]");
      const secondary = bar?.querySelectorAll("button")[1];
      if (!secondary) return null;
      const imgs = Array.from(secondary.querySelectorAll("img"));
      for (const img of imgs) {
        if (img.style.opacity === "1") return img.src;
      }
      return null;
    });

    expect(secondarySrc, "no visible secondary walks photo found").not.toBeNull();
    expect(secondarySrc!).toContain("dogs_public");
    expect(secondarySrc!).not.toContain("dog_home");
    expect(secondarySrc!).not.toContain("bulka_tv");
  });

  // Active index must not skip backwards during a real forward scroll.
  test("active index is monotonically non-decreasing while scrolling forward", async ({ page }) => {
    const indices: number[] = [];

    const range = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll<HTMLElement>("[data-habit-item]"));
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return null;
      return {
        start: window.scrollY + first.getBoundingClientRect().top - 220,
        end: window.scrollY + last.getBoundingClientRect().top - 220,
      };
    });
    expect(range, "could not compute habits scroll range").not.toBeNull();

    for (let i = 0; i <= 14; i++) {
      const y = range!.start + ((range!.end - range!.start) * i) / 14;
      await page.evaluate((targetY) => {
        window.scrollTo({ top: Math.max(0, targetY), behavior: "instant" });
      }, y);
      await page.waitForTimeout(150);

      const activeState = await page.evaluate(() => {
        const container = document.querySelector("[data-mobile-photo-stick]") as HTMLElement | null;
        if (!container) return { idx: -1, visible: false };
        const visible = parseFloat(window.getComputedStyle(container).opacity) > 0.9;
        const primary = container.querySelector("button");
        if (!primary) return { idx: -1, visible };
        const imgs = Array.from(primary.querySelectorAll("img"));
        for (let j = 0; j < imgs.length; j++) {
          if (imgs[j].style.opacity === "1") return { idx: j, visible };
        }
        return { idx: -1, visible };
      });
      if (activeState.visible) indices.push(activeState.idx);
    }

    // Verify no backward jumps.
    for (let i = 1; i < indices.length; i++) {
      expect(
        indices[i],
        `active index jumped backward from ${indices[i - 1]} to ${indices[i]} at step ${i}`,
      ).toBeGreaterThanOrEqual(indices[i - 1]);
    }
  });
});
