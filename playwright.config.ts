import { defineConfig, devices } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The smoke test runs against the real built server with a throw-away data
// directory and well-known test credentials (password: "landscape-test").
const dataDir = process.env.E2E_DATA_DIR ?? mkdtempSync(join(tmpdir(), 'landscape-e2e-'));
const port = Number(process.env.E2E_PORT ?? 8091);
// Embed proxy ports for the E2E server (the default 8081-8100 would contain the server's own port).
const E2E_PROXY_PORTS = { start: port + 10, end: port + 12 };
const passwordHash = '$2b$10$8XiDH4Dqh6zcEsZiDF9AxusXmJhj3GZ.W7aitTZVk9zLyEV97/v3e';

export default defineConfig({
  testDir: 'Tests/E2E',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { ...devices['iPhone 13'], browserName: 'chromium', viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: 'node --disable-warning=ExperimentalWarning Server/dist/Main.js',
    url: `http://127.0.0.1:${port}/healthz`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      PORT: String(port),
      DATA_DIR: dataDir,
      LOGIN_USERNAME: 'admin',
      LOGIN_PASSWORD_HASH: passwordHash,
      SESSION_SECRET: 'e2e-session-secret-not-for-production-use',
      LOG_LEVEL: 'warn',
      PROXY_PORT_START: String(E2E_PROXY_PORTS.start),
      PROXY_PORT_END: String(E2E_PROXY_PORTS.end),
    },
  },
});
