// Gallery context probes import source modules from Vite's development server.
// Keep these component checks separate from the public-site E2E entry point.
import { defineConfig } from "@playwright/test";
import config from "./playwright.config";

export default defineConfig(config, { testDir: "./tests/component" });
