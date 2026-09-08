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
// S3 test defaults
process.env.S3_BUCKET ??= 'test-bucket'
process.env.S3_REGION ??= 'us-east-1'
process.env.S3_ENDPOINT ??= 'http://localhost:4566'
process.env.S3_ACCESS_KEY_ID ??= 'test'
process.env.S3_SECRET_ACCESS_KEY ??= 'test'
process.env.PRESIGNED_URL_EXPIRY ??= '3600'