// Preloaded via bunfig.toml [test].preload before test-file imports.
// Applies test env defaults. For integration runs (PG_TEST=1, or the legacy
// detection when bun runs the preload itself), starts the testcontainers
// Postgres BEFORE test-file imports — src/config/env.ts snapshots
// DATABASE_URL at import time, so a beforeAll hook would be too late.
//
// Note: bunfig [test].preload receives empty argv, so it cannot know which
// files will run. Integration tests therefore call startTestcontainer() in
// their own beforeAll as well — it is idempotent and caches its promise, so
// the container is created exactly once per process and reused.

process.env.NODE_ENV = 'test'
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test_db'
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-min-32-chars!!!'
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-min-32-chars!!!'
process.env.SWAGGER_ENABLED ??= 'false'
process.env.RATE_LIMIT_MAX ??= '1000000'
process.env.RATE_LIMIT_TIME_WINDOW ??= '1 minute'
process.env.RATE_LIMIT_AUTH_MAX ??= '1000000'
process.env.S3_BUCKET ??= 'test-bucket'
process.env.S3_REGION ??= 'us-east-1'
process.env.S3_ENDPOINT ??= 'http://localhost:4566'
process.env.S3_ACCESS_KEY_ID ??= 'test'
process.env.S3_SECRET_ACCESS_KEY ??= 'test'
process.env.PRESIGNED_URL_EXPIRY ??= '3600'

if (process.env.PG_TEST === '1') {
  const { startTestcontainer } = await import('./testcontainers.js')
  await startTestcontainer()
}
