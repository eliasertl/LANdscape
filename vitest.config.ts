import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@landscape/shared': `${root}Shared/src/index.ts`,
      '@server': `${root}Server/src`,
    },
  },
  test: {
    include: ['Tests/Server/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20000,
    hookTimeout: 20000,
    execArgv: ['--disable-warning=ExperimentalWarning'],
    env: {
      // Keep tests hermetic: never pick up a developer's real env.
      LOGIN_USERNAME: '',
      LOGIN_PASSWORD_HASH: '',
    },
  },
});
