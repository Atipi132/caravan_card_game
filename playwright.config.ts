import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the production build served by the game server.
 * Set E2E_BASE_URL to run them against an already running deployment instead
 * (e.g. `E2E_BASE_URL=https://caravan.example.org npm run e2e` as a post-deploy smoke test).
 */
const external = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: external ?? 'http://localhost:3100',
    viewport: { width: 1600, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 900 } } }],
  webServer: external
    ? undefined
    : {
        command: 'npm run build && PORT=3100 node apps/server/dist/index.js',
        url: 'http://localhost:3100/healthz',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
