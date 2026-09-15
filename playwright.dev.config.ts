import { defineConfig } from "@playwright/test";
import config from "./playwright.config";

export default defineConfig({
  ...config,
  testMatch: "style-contracts.spec.ts",
  grep: /@css/,
  webServer: {
    command: "npm run dev -- --port 3193",
    port: 3193,
  },
  use: { ...config.use, baseURL: "http://127.0.0.1:3193" },
});
