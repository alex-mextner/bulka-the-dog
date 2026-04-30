# iOS Safari Remaining Issues Plan

Current production deployment observed by the user:
`https://bulka-the-cb2jnaxhp-mextner-7370s-projects.vercel.app`

Current code baseline:
`185bffb Fix mobile lightbox viewport`

Important constraint:
Run local Playwright before every commit and push. Do not break the pixel-perfect pinch handoff tests.

## Remaining Symptoms

1. Lightbox still leaves a visible top gap under the iOS status/Dynamic Island area.
2. Lightbox bottom still shows the underlying page through the Safari bottom address bar area.
3. The main page still sometimes shows a grey strip at the bottom after repeated scrolls/menu navigation.
4. The lightbox portal now reports the expected tall height in Safari Inspector (`--bulka-viewport-height: 852px`), but that alone is not enough because Safari chrome can still reveal the document canvas underneath.
5. Cold-cache pinch and Android back are covered by Playwright after `185bffb`, but both still need real-device regression checks after the remaining viewport fixes.

## Guardrails

- Do not solve the issue by random per-element offsets.
- Do not add history entries for every slide in the lightbox.
- Do not regress pinch-to-open zoom/pan transfer.
- Do not hide or move lightbox content under Safari chrome without also keeping captions and controls usable.
- Keep changes scoped to viewport, modal backing, and lightbox lifecycle unless evidence points elsewhere.

### Task 1: Capture The Real Safari Geometry State

Goal:
Record exactly which layer Safari is painting in the visible top and bottom strips.

Steps:

1. Open the latest deployment on real iOS Safari.
2. Open the lightbox by normal tap and by pinch.
3. In Safari Web Inspector, record computed geometry and styles for:
   - `html`
   - `body`
   - `#root`
   - `.bulka-lightbox-backdrop`
   - `.bulka-lightbox.yarl__portal`
   - `.bulka-lightbox .yarl__container`
   - `.yarl__carousel`
   - `.yarl__slide_current`
   - `.yarl__slide_captions_container`
4. Record these runtime values:
   - `window.innerHeight`
   - `window.visualViewport.height`
   - `window.visualViewport.offsetTop`
   - `screen.height`
   - `getComputedStyle(document.documentElement).getPropertyValue("--bulka-viewport-height")`
   - `getComputedStyle(document.documentElement).getPropertyValue("--bulka-viewport-bottom-inset")`
   - `document.body.className`
5. Save before/after screenshots for:
   - lightbox opened by tap
   - lightbox opened by pinch
   - page after the grey bottom strip appears

Exit criteria:
We know whether the visible strip is coming from `#root`, `body`, `html`, yarl internals, Safari chrome compositing, or a transparent/cropped lightbox layer.

### Task 2: Make Lightbox Backing A Real Modal Canvas

Goal:
When the lightbox is open, Safari must never reveal live page content behind the modal, including through top/bottom browser chrome.

Current evidence:
In the latest screenshot, `.bulka-lightbox.yarl__portal` is `393 x 852`, but page text is still visible through the bottom Safari bar. This means portal height is not the only problem; the document canvas below the modal is still visible to Safari.

Implementation direction:

1. Prefer a CSS modal-open state based on yarl's `body.yarl__no_scroll` class instead of JS inline repaint effects.
2. Test options locally and on device:
   - `body.yarl__no_scroll #root { visibility: hidden; }`
   - `body.yarl__no_scroll #root { opacity: 0; }`
   - `body.yarl__no_scroll { background: #000; }` plus `html` background only while modal-open via CSS
   - a fixed `.bulka-lightbox-backdrop` with stronger stacking/compositing rules
3. Keep the yarl portal and backdrop as the visible modal layers.
4. Do not allow the page text to show through the bottom browser bar.
5. Confirm that closing the lightbox restores the page without scroll jumps.

Tests to add or update:

1. A Playwright regression that opening the lightbox applies the chosen CSS modal state.
2. A Playwright regression that closing the lightbox removes the modal state.
3. Keep the test explicit that this is modal canvas isolation, not a random inline repaint effect.

Exit criteria:
On real iOS Safari, neither top nor bottom system/browser areas show page content while the lightbox is open.

### Task 3: Fix Top Dynamic Island Gap Without Cropping Content

Goal:
The lightbox must visually enter the top status/Dynamic Island area while controls remain below the unsafe zone.

Current evidence:
After `185bffb`, the portal starts at `top: 0` and has correct full height, but the top status area still appears white in the screenshot.

Implementation direction:

1. Separate "paint coverage" from "interactive content placement".
2. If top overscan is needed, apply it only to backing/paint layers or portal geometry in a way that does not shift the image math unexpectedly.
3. Keep toolbar/counter padding based on `--safe-area-top`.
4. Re-run the pixel-perfect handoff tests after every geometry change.

Tests to add or update:

1. Existing fullscreen tests should assert portal/backdrop geometry for the selected strategy.
2. Existing handoff screenshot tests must still pass.
3. Add a focused test for the computed top padding of controls when `--safe-area-top` is injected.

Exit criteria:
On real iOS Safari, the top strip is covered, the close button is usable, and pinch handoff still matches before/after screenshots.

### Task 4: Fix Bottom Address Bar Bleed And Caption Placement

Goal:
The bottom Safari bar area must not show the page, and the caption must not be hidden under the address bar.

Current evidence:
The screenshot shows page text visible under the caption/bottom area. The portal height is tall enough, but browser chrome compositing still reveals the page canvas.

Implementation direction:

1. Treat bottom browser chrome as a modal backing/canvas isolation problem first.
2. Keep `--bulka-viewport-bottom-inset` for caption/control placement, but do not rely on it alone for paint coverage.
3. Verify caption bottom padding on:
   - compact bottom address bar visible
   - address bar collapsed
   - after scroll
   - after pinch-open

Tests to add or update:

1. Existing caption padding test should continue to assert `--bulka-viewport-bottom-inset`.
2. Add a test that the modal-open CSS state isolates the page canvas.
3. Add a screenshot/geometry test around caption placement when `--bulka-viewport-bottom-inset` is injected.

Exit criteria:
On real iOS Safari, no page content is visible below the lightbox, and the caption remains readable above the bottom chrome.

### Task 5: Reproduce And Fix Page Bottom Grey Strip During Scrolls

Goal:
The main page must not show grey/black/cream strips at the bottom during repeated scrolls and menu navigation.

Known symptom:
The strip appears intermittently after scrolling up/down and navigating through the menu. It is not stable in every run.

Investigation steps:

1. Reproduce on real iOS Safari with remote inspector open.
2. Record whether the strip appears when:
   - only scrolling manually
   - using header nav chips
   - opening/closing the mobile menu
   - opening/closing the lightbox before scrolling
3. Inspect computed backgrounds and heights for:
   - `html`
   - `body`
   - `#root`
   - the top-level page shell
   - current section/footer
4. Check whether `--bulka-viewport-height` changes during the scroll sequence.
5. Check whether Safari rubber-band overscroll is still happening despite `overscroll-behavior: none`.

Implementation direction:

1. Keep the page shell min-height tied to the shared viewport var.
2. If the strip is from document canvas exposure, fix the actual canvas/background chain.
3. If the strip is from a section/footer not reaching the viewport, fix that section's layout.
4. If the strip is from mobile menu/lightbox state leakage, clean up the state transition.

Tests to add or update:

1. A Playwright scroll stress test that repeatedly scrolls and taps nav/menu controls.
2. A computed-style regression that `html`, `body`, `#root`, and the page shell all have non-transparent backgrounds and min-heights covering the viewport.
3. If reproducible in Playwright, add a screenshot test for the bottom 80px strip after stress scrolling.

Exit criteria:
On real iOS Safari, repeated scroll/menu navigation does not expose grey/black/cream bottom strips.

### Task 6: Preserve Cold-Cache Pinch Behavior

Goal:
If the full-size image is not cached, releasing pinch must still open the lightbox immediately and never trap the user.

Current status:
After `185bffb`, Playwright has a delayed full-size image test:
`tests/e2e/pinch-thumb-overlay.spec.ts`.

Regression checks:

1. Full-size image delayed: lightbox attaches within 1s.
2. Stretched thumbnail fallback appears.
3. Precise transition overlay detaches.
4. Close button works before full image finishes loading.
5. Once full image loads, fallback fades without breaking zoom/pan.

Exit criteria:
The existing Playwright cold-cache test passes, and the same flow works on real iOS Safari with cache disabled or a never-opened image.

### Task 7: Preserve Android Back Behavior

Goal:
Android/browser back should close the lightbox once, while slide navigation stays out of history.

Current status:
After `185bffb`, Playwright has:
`tests/e2e/lightbox-history.spec.ts`.

Regression checks:

1. Opening the lightbox pushes exactly one lightbox history entry.
2. Next/previous slide clicks do not increase history length.
3. Browser/Android back closes the lightbox.
4. Closing with the close button pops the lightbox entry without leaving the page.

Exit criteria:
The Playwright history test passes and the same behavior is confirmed on Android Chrome.

### Task 8: Final Verification Before Commit And Push

Goal:
Do not ship another viewport fix without local verification.

Required commands:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright test --reporter=list
```

Manual device checks:

1. iOS Safari, tap-open lightbox.
2. iOS Safari, pinch-open lightbox.
3. iOS Safari, cold-cache image open.
4. iOS Safari, repeated scroll/menu navigation for page bottom strip.
5. Android Chrome, back gesture closes lightbox.

Exit criteria:
All local tests pass, manual iOS/Android checks pass, commit is pushed, and Vercel production deployment is Ready.
