# Fastify API Boilerplate

Production-ready Fastify 5 + PostgreSQL API with layered architecture.

## Tech stack
- Node 22, TypeScript 5.9 strict (ESM), pnpm
- Fastify 5 + @fastify/type-provider-zod (Zod v4)
- PostgreSQL 17 + Drizzle ORM + drizzle-kit
- @fastify/jwt: access (15m) + refresh (7d) with atomic single-use rotation
- argon2id passwords, Pino JSON logs (redacted), Helmet, CORS
- Vitest (testcontainers for Postgres), @usebruno/cli for API e2e
- Docker: Postgres in docker-compose (port 5434), multi-stage Dockerfile

## Project structure
- src/server.ts: entry point (listen + graceful shutdown)
- src/app.ts: buildApp() (injectable, used by tests)
- src/config/env.ts: zod-validated env, fail-fast at startup
- src/plugins/: drizzle, auth (JWT namespaces + guards), error-handler, rate-limit, swagger
- src/modules/auth/: routes → service → repository (+ zod schemas)
- src/modules/member/: routes → service → repository (+ zod schemas)
- src/common/: AppError, pagination, password (argon2)
- src/db/: schema.ts, index.ts, seed.ts, cleanup.ts, migrations/
- src/types/: fastify.d.ts (augmentations), roles.ts (UserRole), auth.ts (AuthenticatedUser)
- tests/: unit/ (mocked repos), integration/ (testcontainers), setup/
- bruno/: API collection for docs + e2e

## Commands
- `pnpm dev` — dev server with watch
- `pnpm build && pnpm start` — production
- `pnpm test` — all tests (unit + integration, testcontainers Postgres)
- `pnpm test:unit` / `pnpm test:integration` — one suite
- `pnpm lint && pnpm typecheck` — static analysis
- `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:seed`
- `pnpm bruno:run` — Bruno e2e (needs server running)
- `pnpm verify` — lint + typecheck + test

## Key patterns
- Layering: routes (Zod validation) → service (business logic) → repository (SQL)
- Response envelope: `{ data }` or `{ data, meta }` for lists; `{ error: { code, message, details? } }`
- Auth: access + refresh JWTs, refresh tokens hashed (SHA-256) in DB, atomic single-use rotation
- All env validated with Zod at startup; server won't start if config is invalid
- Tests use testcontainers for real Postgres; tables truncated in beforeEach
- Bruno collection uses runtime variables to chain login → authenticated requests

## Docker
- Postgres runs via `docker compose up -d` (port 5434)
- App built with multi-stage Dockerfile (node:22-bookworm-slim)
- Production image runs as non-root (USER node)

## CI
GitHub Actions: lint → typecheck → test (testcontainers) → build, then e2e (Postgres service + bru run)
