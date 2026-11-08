import { defineConfig, devices } from '@playwright/test';

const PORT = 4317;

export default defineConfig({
  testDir: 'specs',
  // The fixture server keeps state (request log, store) across requests, so specs
  // run one at a time rather than racing over it.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  outputDir: '../node_modules/.e2e-results',
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: `PORT=${PORT} node server.ts`,
    url: `http://localhost:${PORT}/smoke.html`,
    reuseExistingServer: !process.env.CI,
  },
});
