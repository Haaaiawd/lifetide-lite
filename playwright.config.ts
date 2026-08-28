import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  globalSetup: "tests/integration/global.setup.ts",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    ...devices["Desktop Chrome"],
  },
  projects: [
    {
      name: "mobile",
      testMatch: "e2e/**/*.spec.ts",
      use: {
        viewport: { width: 360, height: 800 },
        userAgent: devices["iPhone 12"].userAgent,
      },
    },
    {
      name: "desktop",
      testMatch: "e2e/**/*.spec.ts",
      use: {
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "integration",
      testMatch: "integration/**/*.test.ts",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    env: { AI_PROVIDER: "fixture" },
  },
});
