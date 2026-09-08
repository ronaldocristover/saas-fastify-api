// Runs before every test file's imports so services see a valid environment
// before app.ts / config/env.ts are loaded. Keeps `vitest` runnable with no
// .env and forces test-friendly limits (rate limiter effectively disabled).
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test_db'
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-min-32-chars!!!'
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-min-32-chars!!!'
process.env.SWAGGER_ENABLED ??= 'false'
process.env.RATE_LIMIT_MAX ??= '1000000'
process.env.RATE_LIMIT_TIME_WINDOW ??= '1 minute'
process.env.RATE_LIMIT_AUTH_MAX ??= '1000000'