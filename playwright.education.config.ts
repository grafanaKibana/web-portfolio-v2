import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "home-layout.spec.ts",
  workers: 1,
  webServer: {
    command: "npm start -- --port 3192",
    port: 3192,
  },
  use: { baseURL: "http://127.0.0.1:3192" },
  projects: [{ name: "chromium", use: devices["Desktop Chrome"] }],
});
