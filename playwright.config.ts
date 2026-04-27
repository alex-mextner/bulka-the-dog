import { defineConfig, devices } from "@playwright/test";

// E2E config for the bulka.rs site. Tests live in tests/e2e/. Runs
// against a dev server by default (`pnpm dev`); override with
// E2E_BASE_URL=https://www.bulka.rs to hit production.
//
// We always run with mobile-emulation context (iPhone 13) because every
// failure mode we've debugged has been a touch / mobile-Safari issue.
// The desktop branch is exercised through unit tests where appropriate.

const baseURL = process.env.E2E_BASE_URL || "http://localhost:8080";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // shared dev server; sequential is fine
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      // Chromium emulating iPhone-13 (we don't have webkit installed and
      // bringing it in just for these tests bloats CI). The bugs we test
      // for are reproducible in Chromium-emulated mobile because they're
      // about React/yarl/scroll-API behaviour, not Safari-specific
      // rendering. Real-device verification is still done by hand.
      name: "Mobile-Chromium",
      use: {
        ...devices["Pixel 5"],
        // Override UA + viewport with iPhone-13 numbers so the site
        // serves the same paths a real iPhone would request.
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      },
    },
  ],
  // Auto-start the dev server when running locally and no E2E_BASE_URL is set.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm dev",
        url: "http://localhost:8080",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
