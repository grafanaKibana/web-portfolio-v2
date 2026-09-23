import { defineConfig, devices } from "@playwright/test";
import config from "./playwright.config";

export default defineConfig({
  ...config,
  testMatch: "style-contracts.spec.ts",
  testIgnore: [],
  grep: /@css/,
  projects: [{ name: "chromium", use: devices["Desktop Chrome"] }],
  webServer: {
    command: "PORTFOLIO_E2E_DIST_DIR=.next-e2e-dev npm run dev -- --port 3193",
    port: 3193,
  },
  use: { ...config.use, baseURL: "http://localhost:3193" },
});
