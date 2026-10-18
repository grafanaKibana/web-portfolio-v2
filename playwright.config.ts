import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: ["style-contracts.spec.ts", "home-layout.spec.ts"],
  workers: 2,
  webServer: {
    command: "npm start -- --port 3192",
    port: 3192,
  },
  use: { baseURL: "http://127.0.0.1:3192" },
  projects: [
    { name: "chromium", use: devices["Desktop Chrome"] },
    { name: "webkit", grep: /@webkit/, use: devices["Desktop Safari"] },
  ],
});
