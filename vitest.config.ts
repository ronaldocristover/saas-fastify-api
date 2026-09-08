import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: './tests/setup/global-setup.ts',
    setupFiles: ['./tests/setup/env.ts'],
    coverage: { provider: 'v8', enabled: true },
    include: ['tests/**/*.test.ts'],
    // Integration files share one testcontainers Postgres and truncate tables
    // per test, so files must not run in parallel against the same schema.
    fileParallelism: false,
  },
})