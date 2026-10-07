# Fastify API Boilerplate

Production-ready Fastify 5 + PostgreSQL API with layered architecture, JWT auth
with atomic refresh token rotation, and S3 file uploads.

## Tech stack
- Bun >=1.4 — runtime, package manager, and test runner (ESM, `bun.lock`)
- TypeScript 5.9 strict
- Fastify 5 + @fastify/type-provider-zod (Zod v4)
- PostgreSQL 17 + Drizzle ORM + drizzle-kit
- @fastify/jwt: access (15m) + refresh (7d) with atomic single-use rotation
- argon2id passwords, Pino JSON logs (redacted), Helmet, CORS, rate limit
- S3 uploads (@aws-sdk/client-s3 + @fastify/multipart) with presigned download URLs
- Tests: `bun test` (unit + integration, testcontainers Postgres), `@usebruno/cli` for API e2e

## Project structure
- src/server.ts: entry point (listen + graceful shutdown, startup token cleanup)
- src/app.ts: buildApp() (injectable, used by tests)
- src/config/env.ts: zod-validated env, fail-fast at startup
- src/plugins/: drizzle, auth (JWT namespaces + guards), error-handler, rate-limit, s3, swagger
- src/modules/auth/: routes → service → repository (+ zod schemas)
- src/modules/member/: routes → service → repository (+ zod schemas)
- src/modules/file/: routes → service → repository (S3 uploads + presigned URLs)
- src/common/: AppError + factories (unauthorized/forbidden/badRequest/notFound/payloadTooLarge/conflict), pagination, password (argon2)
- src/db/: schema.ts, index.ts (pool), seed.ts, cleanup.ts, migrations/
- src/types/: fastify.d.ts (augmentations), roles.ts (UserRole), auth.ts (AuthenticatedUser)
- tests/: unit/ (mocked repos), integration/ (testcontainers), setup/ (preload + container)
- bruno/: API collection for docs + e2e

## Commands
- `bun run dev` — dev server with watch
- `bun run build && bun run start` — production
- `bun test` — all tests (Docker required: testcontainers spins up Postgres)
- `bun run test:unit` / `bun run test:integration` — one suite (integration needs Docker)
- `bun run lint && bun run typecheck` — static analysis
- `bun run db:generate` / `bun run db:migrate` / `bun run db:seed`
- `bun run bruno:run` — Bruno e2e (needs server running)
- `bun run verify` — lint + typecheck + test

## Key patterns
- Layering: routes (Zod validation) → service (business logic) → repository (SQL)
- Response envelope: `{ data }` or `{ data, meta }` for lists; `{ error: { code, message, details? } }`
- Auth: access + refresh JWTs; refresh tokens hashed (SHA-256) in DB, atomic single-use rotation
- Files: multipart (`MAX_FILE_SIZE` = 10MB) → S3 object + DB metadata row; admin lists all files, members only their own
- All env validated with Zod at startup; server won't start if config is invalid
- Tests use testcontainers for real Postgres; tables truncated in beforeEach
- Bruno collection uses runtime variables to chain login → authenticated requests

## Docker
- Postgres runs via `docker compose up -d` (port 5434)
- App built with multi-stage Dockerfile (oven/bun:1-slim); production image runs as non-root

## CI
GitHub Actions: lint → typecheck → test (testcontainers) → build, then e2e
(Postgres + MinIO service containers → migrate/seed → start server → `bru run`).
