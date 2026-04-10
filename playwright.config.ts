import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  retries: 1,
  use: {
    baseURL:
      process.env.PLAYWRIGHT_BASE_URL ||
      "https://pathfindernexus5821adad-app.functions.fnc.fr-par.scw.cloud",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
