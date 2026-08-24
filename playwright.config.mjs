import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    // The design system targets 390x844 portrait (docs/plan/02-design-system.md).
    // Chromium is the browser available in CI here; WebKit is not installed.
    browserName: 'chromium',
    // This environment preinstalls Chromium at a build the pinned
    // @playwright/test doesn't expect, so point at it explicitly rather than
    // downloading a second copy.
    launchOptions: { executablePath: '/opt/pw-browsers/chromium' },
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
  webServer: {
    // --host 127.0.0.1 is load-bearing: vite preview otherwise binds "localhost",
    // which on a CI runner can resolve to ::1 only, so polling 127.0.0.1 never
    // succeeds and the server appears to never start.
    command: 'npx vite preview --port 4173 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 120_000,
  },
});
