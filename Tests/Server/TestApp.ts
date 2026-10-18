import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildApp, type BuiltApp } from '@server/App';
import { loadConfig, type Config } from '@server/Config';

/** bcrypt hash of "correct horse battery staple" (cost 4 keeps tests fast). */
export const TEST_USERNAME = 'admin';
export const TEST_PASSWORD = 'correct horse battery staple';
export const TEST_PASSWORD_HASH = '$2b$04$0FxbrePfnjWL0OskF6rcgOJiBe3OXx2X9hF6Jj775xwXx82btbPWa';

export interface TestApp extends BuiltApp {
  dataDir: string;
  cleanup(): Promise<void>;
}

export async function createTestApp(overrides: Partial<Config> = {}): Promise<TestApp> {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'landscape-test-'));
  const config = loadConfig({
    loginUsername: TEST_USERNAME,
    loginPasswordHash: TEST_PASSWORD_HASH,
    dataDir,
    sessionSecret: 'test-secret-test-secret-test-secret-test-secret',
    clientDir: path.join(dataDir, 'no-client'),
    hostProc: path.join(dataDir, 'no-proc'),
    hostSys: path.join(dataDir, 'no-sys'),
    hostRoot: null,
    dockerSocket: path.join(dataDir, 'no-docker.sock'),
    ssh: { host: '127.0.0.1', port: 2222, user: null, keyPath: path.join(dataDir, 'no-key') },
    logLevel: 'silent',
    ...overrides,
  });
  const built = await buildApp({ config, logger: false });
  await built.app.ready();
  return {
    ...built,
    dataDir,
    async cleanup() {
      await built.close();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

/** Logs in and returns the raw Cookie header to reuse in later requests. */
export async function loginCookie(app: TestApp, ip = '127.0.0.1'): Promise<string> {
  const response = await app.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    remoteAddress: ip,
    headers: { origin: 'http://localhost', host: 'localhost' },
    payload: { username: TEST_USERNAME, password: TEST_PASSWORD },
  });
  if (response.statusCode !== 200) throw new Error(`Login failed: ${response.statusCode} ${response.body}`);
  const cookie = response.cookies.find((c) => c.name === 'landscape_session');
  if (!cookie) throw new Error('No session cookie set');
  return `${cookie.name}=${cookie.value}`;
}
