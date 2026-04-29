import { expect, test } from "@playwright/test";

// Desktop-only tests for PhotoStrip mouse behaviour.
// Uses a desktop viewport + non-touch UA so isTouchDevice() returns false and
// touchMode stays false — desktop mouse handlers are active.

test.use({
  viewport: { width: 1280, height: 800 },
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  hasTouch: false,
  isMobile: false,
  deviceScaleFactor: 1,
});

// ---- helpers ----------------------------------------------------------------

/** Read current strip offset via the debug hook. */
async function getOffset(page: Parameters<typeof test>[1]["page"]): Promise<number> {
  return page.evaluate(() => (window as unknown as { __photoStripDebug?: { getOffset: () => number } }).__photoStripDebug?.getOffset() ?? NaN);
}

/** Read entryX from the debug hook. */
async function getEntryX(page: Parameters<typeof test>[1]["page"]): Promise<number | null> {
  return page.evaluate(() => (window as unknown as { __photoStripDebug?: { getEntryX: () => number | null } }).__photoStripDebug?.getEntryX() ?? null);
}

/** True if mouse drift is currently suppressed by the post-wheel cooldown. */
async function isMouseBlocked(page: Parameters<typeof test>[1]["page"]): Promise<boolean> {
  return page.evaluate(() => (window as unknown as { __photoStripDebug?: { getMouseBlocked: () => boolean } }).__photoStripDebug?.getMouseBlocked() ?? false);
}

/** Wait N milliseconds. */
async function wait(page: Parameters<typeof test>[1]["page"], ms: number): Promise<void> {
  await page.waitForTimeout(ms);
}

/** Load the page (desktop mode) and scroll the strip into view. */
async function setup(page: Parameters<typeof test>[1]["page"]): Promise<void> {
  await page.goto("/", { waitUntil: "load" });
  // Confirm desktop mode — data-touch-mode should be "false".
  await page.waitForSelector('[data-photo-strip][data-touch-mode="false"]', {
    timeout: 8_000,
  });
  // Scroll gallery into view so IntersectionObserver fires.
  await page.evaluate(() => {
    document.getElementById("gallery")?.scrollIntoView({ behavior: "instant" });
  });
  // Let IO settle.
  await page.waitForTimeout(300);
}

/** Return the bounding rect of the strip viewport element. */
async function stripRect(
  page: Parameters<typeof test>[1]["page"],
): Promise<{ x: number; y: number; width: number; height: number }> {
  return page.evaluate(() => {
    const el = document.querySelector("[data-photo-strip]") as HTMLElement | null;
    if (!el) throw new Error("PhotoStrip not found");
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  });
}

// ---- Bug A ------------------------------------------------------------------

test.describe("Bug A — post-wheel mouse drift suppressed for 1500ms", () => {
  test("offset does not accelerate after mousemove during 1500ms cooldown", async ({
    page,
  }) => {
    await setup(page);
    const rect = await stripRect(page);
    const midY = rect.y + rect.height / 2;
    const midX = rect.x + rect.width / 2;

    // Move mouse onto the strip first.
    await page.mouse.move(midX, midY);

    // Fire horizontal wheel events (simulate trackpad swipe rightward).
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(60, 0);
      await wait(page, 30);
    }

    // Wait for wheel 600ms timeout to expire, stay within 1500ms cooldown.
    await wait(page, 700);

    // Confirm we are still in the cooldown.
    const blocked = await isMouseBlocked(page);
    expect(blocked, "mouse drift should be blocked within 1500ms of wheel").toBe(true);

    // Measure drift rate BEFORE moving mouse (purely auto-drift or leftover inertia).
    const o1 = await getOffset(page);
    await wait(page, 150);
    const o2 = await getOffset(page);
    const rateBefore = (o2 - o1) / 150; // px/ms, could be near-zero or slight

    // Now move mouse far to the left — which normally would produce strong
    // leftward velocity and decrease offset significantly.
    await page.mouse.move(rect.x + 10, midY);
    await wait(page, 150);
    const o3 = await getOffset(page);
    const rateAfter = (o3 - o2) / 150;

    // Mouse should NOT have injected leftward velocity during cooldown.
    // rateBefore and rateAfter should be similar (both near-zero auto-drift).
    // If mouse drift was active, rateAfter would be strongly negative.
    expect(
      rateAfter,
      `expected offset rate not to decrease sharply on mousemove (${rateAfter.toFixed(3)} px/ms), cooldown should suppress mouse drift`,
    ).toBeGreaterThan(-0.1); // allow up to 100px/s leftward from bounce/drift, not the full ~90px/s mouse vel
  });

  test("mouse drift resumes after 1500ms cooldown", async ({ page }) => {
    await setup(page);
    const rect = await stripRect(page);
    const midY = rect.y + rect.height / 2;
    const midX = rect.x + rect.width / 2;

    await page.mouse.move(midX, midY);

    // Fire wheel events.
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(60, 0);
      await wait(page, 20);
    }

    // Wait past the full 1500ms cooldown.
    await wait(page, 1600);

    const blocked = await isMouseBlocked(page);
    expect(blocked, "mouse drift should be unblocked after 1600ms").toBe(false);
  });
});

// ---- Bug B ------------------------------------------------------------------

test.describe("Bug B — no jump on mouse enter", () => {
  test("offset is stable right after mouseenter with no mouse movement", async ({
    page,
  }) => {
    await setup(page);
    const rect = await stripRect(page);
    const midY = rect.y + rect.height / 2;

    // Start outside the strip, then enter.
    await page.mouse.move(rect.x - 50, midY);
    await wait(page, 100);

    const offsetBefore = await getOffset(page);

    // Move into the strip — triggers mouseenter + first mousemove that seeds entryX.
    await page.mouse.move(rect.x + 200, midY);
    // Give two rAF frames (≈33ms).
    await wait(page, 50);

    const offsetAfter = await getOffset(page);
    // No significant jump: mouse just entered, velocity should be 0.
    // Allow 5px for normal auto-drift budget over 50ms at baseSpeed.
    expect(
      Math.abs(offsetAfter - offsetBefore),
      `strip jumped ${Math.abs(offsetAfter - offsetBefore)}px on mouseenter`,
    ).toBeLessThan(5);
  });

  test("entryX is null before entering, set after first move inside", async ({
    page,
  }) => {
    await setup(page);
    const rect = await stripRect(page);
    const midY = rect.y + rect.height / 2;

    // Outside the strip.
    await page.mouse.move(rect.x - 50, midY);
    const entryBefore = await getEntryX(page);
    expect(entryBefore, "entryX should be null when mouse is outside").toBeNull();

    // Enter the strip.
    await page.mouse.move(rect.x + 300, midY);
    await wait(page, 50);

    const entryAfter = await getEntryX(page);
    expect(entryAfter, "entryX should be set after entering strip").not.toBeNull();
  });
});

// ---- Bug C ------------------------------------------------------------------

test.describe("Bug C — asymmetric velocity projection from entry point", () => {
  test("moving left from entry point moves offset toward 0 (scrolls left)", async ({
    page,
  }) => {
    await setup(page);
    const rect = await stripRect(page);
    const midY = rect.y + rect.height / 2;

    // Enter near the right side so there is room to go left and the strip
    // has scrolled content in both directions.
    const entryClientX = rect.x + rect.width * 0.7;
    await page.mouse.move(entryClientX, midY);
    await wait(page, 80); // seed entryX, let velocity = 0

    const offsetAtEntry = await getOffset(page);

    // Move far left (toward left edge) — should produce leftward velocity →
    // offset decreases (strip scrolls left, shows earlier images).
    await page.mouse.move(rect.x + 20, midY);
    await wait(page, 200); // let rAF accumulate movement

    const offsetAfterLeft = await getOffset(page);
    expect(
      offsetAfterLeft,
      `expected offset to decrease when moving left (${offsetAfterLeft} < ${offsetAtEntry})`,
    ).toBeLessThan(offsetAtEntry);
  });

  test("moving right from entry point moves offset toward max (scrolls right)", async ({
    page,
  }) => {
    await setup(page);
    const rect = await stripRect(page);
    const midY = rect.y + rect.height / 2;

    // Enter near the left side so there is room to move right.
    const entryClientX = rect.x + 200;
    await page.mouse.move(entryClientX, midY);
    await wait(page, 80); // seed entryX

    const offsetAtEntry = await getOffset(page);

    // Move far right — should produce rightward velocity → offset increases.
    await page.mouse.move(rect.x + rect.width - 20, midY);
    await wait(page, 200);

    const offsetAfterRight = await getOffset(page);
    expect(
      offsetAfterRight,
      `expected offset to increase when moving right (${offsetAfterRight} > ${offsetAtEntry})`,
    ).toBeGreaterThan(offsetAtEntry);
  });

  test("velocity is 0 when cursor is exactly at entry point", async ({
    page,
  }) => {
    await setup(page);
    const rect = await stripRect(page);
    const midY = rect.y + rect.height / 2;
    const entryClientX = rect.x + rect.width / 2;

    // Enter and move back to exact entry x.
    await page.mouse.move(entryClientX, midY);
    await wait(page, 80);

    // Move away then return to entryX.
    await page.mouse.move(entryClientX + 100, midY);
    await wait(page, 30);
    await page.mouse.move(entryClientX, midY);
    await wait(page, 30);

    const vel = await page.evaluate(
      () =>
        (
          window as unknown as {
            __photoStripDebug?: { getMouseVelocity: () => number };
          }
        ).__photoStripDebug?.getMouseVelocity() ?? 0,
    );
    expect(Math.abs(vel), "velocity at entry point should be 0").toBeLessThan(0.1);
  });

  test("asymmetric magnitude: equal cursor displacement produces different velocity near left vs right edge", async ({
    page,
  }) => {
    // This test specifically discriminates the asymmetric formula from a naive
    // symmetric one (vel = dx/W * maxBoost). With entryX near the left edge
    // (leftDist=100, rightDist=1180), moving 50px left should produce much
    // stronger velocity than moving 50px right.
    await setup(page);
    const rect = await stripRect(page);
    const midY = rect.y + rect.height / 2;

    // Enter near the left edge (leftDist ≈ 100, rightDist ≈ 1180).
    const entryClientX = rect.x + 100;
    await page.mouse.move(entryClientX, midY);
    await wait(page, 80); // seed entryX

    const getVel = () =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __photoStripDebug?: { getMouseVelocity: () => number };
            }
          ).__photoStripDebug?.getMouseVelocity() ?? 0,
      );

    // Move 50px left from entryX.
    await page.mouse.move(entryClientX - 50, midY);
    await wait(page, 20);
    const velLeft = await getVel();

    // Return to entryX, then move 50px right.
    await page.mouse.move(entryClientX, midY);
    await wait(page, 20);
    await page.mouse.move(entryClientX + 50, midY);
    await wait(page, 20);
    const velRight = await getVel();

    // Asymmetric formula: |vel_left| / |vel_right| ≈ rightDist/leftDist ≈ 11.8×
    // Symmetric formula: both equal ≈ 50/W * maxBoost ≈ same magnitude.
    // We just need the ratio > 5 to clearly discriminate.
    expect(
      Math.abs(velLeft),
      `left velocity (${velLeft.toFixed(2)}) should be significantly larger than right velocity (${velRight.toFixed(2)})`,
    ).toBeGreaterThan(Math.abs(velRight) * 5);
  });
});

// ---- Bug B+C re-entry -------------------------------------------------------

test.describe("Bug B+C — re-entry reseeds X0, no jump", () => {
  test("leaving and re-entering strip reseeds entry point", async ({ page }) => {
    await setup(page);
    const rect = await stripRect(page);
    const midY = rect.y + rect.height / 2;

    // First entry.
    await page.mouse.move(rect.x + 300, midY);
    await wait(page, 80);
    const entryFirst = await getEntryX(page);

    // Leave the strip.
    await page.mouse.move(rect.x - 50, midY);
    await wait(page, 30);
    const entryAfterLeave = await getEntryX(page);
    expect(entryAfterLeave, "entryX cleared on leave").toBeNull();

    // Re-enter at a different X.
    const reentryX = rect.x + 700;
    await page.mouse.move(reentryX, midY);
    await wait(page, 80);
    const entrySecond = await getEntryX(page);

    expect(entryFirst).not.toBeNull();
    expect(entrySecond).not.toBeNull();
    // The two entry points should differ (entered at different X).
    expect(
      Math.abs((entrySecond ?? 0) - (entryFirst ?? 0)),
      "second entryX should differ from first after re-entry",
    ).toBeGreaterThan(50);
  });

  test("no jump on re-entry: offset stable for 50ms right after second mouseenter", async ({
    page,
  }) => {
    await setup(page);
    const rect = await stripRect(page);
    const midY = rect.y + rect.height / 2;

    // First entry and move far right.
    await page.mouse.move(rect.x + 200, midY);
    await wait(page, 80);
    await page.mouse.move(rect.x + rect.width - 30, midY);
    await wait(page, 200);

    // Leave.
    await page.mouse.move(rect.x - 50, midY);
    await wait(page, 50);

    // Re-enter at a very different position (left side).
    await page.mouse.move(rect.x + 100, midY);
    const offsetEnter = await getOffset(page);
    await wait(page, 50);
    const offsetAfter = await getOffset(page);

    expect(
      Math.abs(offsetAfter - offsetEnter),
      `strip jumped ${Math.abs(offsetAfter - offsetEnter)}px on re-entry`,
    ).toBeLessThan(5);
  });
});
