# Fastify API Boilerplate

Security-hardened, production-ready Fastify 5 + PostgreSQL API with layered architecture, JWT auth with atomic refresh token rotation, and comprehensive test coverage.

## Stack

- **Fastify 5** + TypeScript 5.9 (strict, ESM)
- **PostgreSQL 17** + Drizzle ORM + drizzle-kit migrations
- **Zod v4** via `@fastify/type-provider-zod` (validation + types from one schema)
- **Auth**: argon2id passwords, JWT access (15m) + rotating refresh tokens (7d, SHA-256 hashed in DB, atomic single-use rotation)
- **Security**: timing-safe login, Pino log redaction, static 404 responses, min-length JWT secrets, Swagger opt-in
- **Observability**: Pino JSON logs (redacted), `/health` + `/ready`, request-ID correlation
- **Docs**: Swagger UI at `/documentation` (requires `SWAGGER_ENABLED=true`)
- **Tests**: Vitest (43 tests across 5 files — unit + integration via testcontainers), Bruno e2e (`@usebruno/cli`)
- **Docker**: Postgres 17 in docker-compose (port 5434), multi-stage production Dockerfile

## Quick start

```bash
# 1. Start Postgres (runs on port 5434)
docker compose up -d

# 2. Install dependencies
pnpm install

# 3. Configure environment
cp .env.example .env

# 4. Run migrations + seed
pnpm db:migrate
pnpm db:seed

# 5. Start dev server
pnpm dev
```

The server is now at `http://localhost:3000`. Swagger UI requires `SWAGGER_ENABLED=true` in your `.env`.

Seeded accounts: `admin@example.com` / `admin123456`, `member1..5@example.com` / `password123`.

## Scripts

| Script | Purpose |
|---|---|
| `pnpm dev` | Dev server with watch mode |
| `pnpm build` / `pnpm start` | Production build + run |
| `pnpm test` | Unit + integration tests (spins up testcontainers Postgres) |
| `pnpm test:unit` / `pnpm test:integration` | Run one suite |
| `pnpm test:coverage` | Tests + v8 coverage |
| `pnpm lint` / `pnpm typecheck` | ESLint / tsc |
| `pnpm db:generate` | Generate migration from schema changes |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:seed` | Seed admin + sample members (idempotent) |
| `pnpm db:studio` | Drizzle Studio (DB browser) |
| `pnpm bruno:run` | Bruno e2e suite against running server |
| `pnpm verify` | lint + typecheck + test |

## API overview

Base URL: `/api/v1`

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/auth/register` | -- | 201, returns user + token pair |
| POST | `/auth/login` | -- | 200, returns user + token pair |
| POST | `/auth/refresh` | -- | Rotates refresh token (old one revoked) |
| POST | `/auth/logout` | Bearer | Revokes refresh token (ownership verified) |
| GET | `/auth/me` | Bearer | Current user profile |
| GET | `/members` | Bearer admin | Paginated: `?page=&limit=&search=&role=` |
| GET | `/members/:id` | Bearer | Any authenticated user |
| PATCH | `/members/:id` | Bearer | Admin: any field incl. role; self: own fullName |
| DELETE | `/members/:id` | Bearer admin | Soft delete |
| GET | `/health` | -- | Liveness |
| GET | `/ready` | -- | Readiness (checks DB) |

### Conventions

- Success envelope: `{ "data": ... }` (lists add `"meta": { page, limit, total, totalPages }`)
- Error envelope: `{ "error": { "code", "message", "details?" } }`
- Access token in `Authorization: Bearer <token>`; refresh token in request/response bodies
- Rate limits: 300 req/min globally, 20 req/min on auth endpoints

## Security

- **Refresh tokens**: Atomic single-use rotation via `revokeIfActive`. Each token gets a random `jti` to guarantee unique hashes. SHA-256 hashed in the DB so a table leak does not expose usable tokens. Expired and long-revoked tokens cleaned up on server startup (revoked tokens retained 30 days for audit trail).
- **Timing-safe login**: Unknown emails run `argon2id` against a dummy hash so response time is identical regardless of whether the user exists.
- **Rate limiting**: All auth endpoints are limited to 20 requests per minute; global limit is 300 requests per minute.
- **Logout ownership**: The `/auth/logout` endpoint verifies the refresh token's `sub` claim matches the authenticated user before revoking.
- **Pino redaction**: The `authorization` header, `password`, and `refreshToken` fields in request bodies are redacted from all log output.
- **Static 404**: Unknown routes return `{ "error": { "code": "NOT_FOUND", "message": "Route not found" } }` with no information about registered routes.
- **JWT secrets**: Both `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` require a minimum of 32 characters, enforced at startup.
- **Swagger opt-in**: `SWAGGER_ENABLED` must be explicitly set to `true`; there is no automatic enablement in development mode.

## Architecture

```
src/
  server.ts            # Entry: listen + graceful shutdown
  app.ts               # buildApp(): plugins + modules, no listen (used by tests)
  config/env.ts        # Zod-validated env, fail-fast
  plugins/             # drizzle, auth (JWT + guards), error-handler, rate-limit, swagger
  common/              # errors (AppError), pagination, password (argon2)
  db/                  # schema.ts, index.ts (pool), seed.ts, cleanup.ts, migrations/
  modules/
    auth/              # schemas -> repository -> service -> routes
    member/            # schemas -> repository -> service -> routes
  routes/health.ts
  types/               # roles.ts (UserRole), auth.ts (AuthenticatedUser), fastify.d.ts
```

Layering rules:

- **routes** validate (Zod) and delegate; no business logic
- **services** own business rules and authorization decisions; depend on repositories via interfaces
- **repositories** own SQL; return domain shapes, never leak `passwordHash`/`deletedAt`

## Auth flow

1. **Register**: validate input -> insert user -> issue access + refresh token pair -> persist refresh token SHA-256 hash in DB
2. **Login**: find user by email -> timing-safe `argon2id` verification (dummy hash on miss) -> issue pair + persist hash
3. **Refresh**: route layer verifies JWT signature -> service calls `revokeIfActive` (atomic single-use, old token revoked) -> issue new pair + persist hash
4. **Logout**: verify refresh token `sub` matches authenticated user -> revoke token hash in DB
5. **Tokens**: access tokens (15m, HS256), refresh tokens (7d, HS256, unique per login via `jti` claim)

## Testing

- **Unit** (`tests/unit`): services tested against mocked repositories
- **Integration** (`tests/integration`): full app via `app.inject()` against real Postgres (testcontainers), tables truncated per test
- **Total**: 43 tests across 5 files (auth service, member service, pagination, auth integration, member integration)
- **E2E**: Bruno collection chains login -> authenticated requests via runtime variables

## Docker

`docker-compose.yml` runs Postgres 17 on port 5434 (host-accessible via `127.0.0.1:5434`). The `Dockerfile` builds a multi-stage production image: build stage compiles TypeScript on bookworm-slim, production stage runs on Alpine (~487MB total) with only production dependencies. argon2 works via its musl prebuild on Alpine.

```bash
docker compose up -d                              # Start Postgres
docker build --platform linux/amd64 -t fastify-api .  # Build production image (~487MB)
docker run --env-file .env -p 3000:3000 fastify-api    # Run
```

## CI

GitHub Actions (`.github/workflows/ci.yml`):

1. **build-and-test**: lint -> typecheck -> tests (testcontainers Postgres) -> build
2. **e2e**: Postgres 17 service container (port 5434) -> migrate -> seed -> start server -> `bru run`

## Configuration

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | `development` / `production` / `test` |
| `PORT` | `3000` | Server listen port |
| `LOG_LEVEL` | `info` | Pino log level (`fatal`, `error`, `warn`, `info`, `debug`, `trace`) |
| `DATABASE_URL` | (required) | PostgreSQL connection string |
| `DATABASE_POOL_MAX` | `10` | Max pool connections (1-100) |
| `JWT_ACCESS_SECRET` | (required, min 32 chars) | HS256 signing key for access tokens |
| `JWT_REFRESH_SECRET` | (required, min 32 chars) | HS256 signing key for refresh tokens |
| `ACCESS_TOKEN_TTL` | `15m` | Access token expiry |
| `REFRESH_TOKEN_TTL_DAYS` | `7` | Refresh token expiry in days |
| `SWAGGER_ENABLED` | `false` | Set to `true` to enable Swagger UI at `/documentation` |
| `CORS_ORIGIN` | `http://localhost:5173` | Comma-separated allowed origins |
| `RATE_LIMIT_MAX` | `300` | Global rate limit per minute |
| `RATE_LIMIT_TIME_WINDOW` | `1 minute` | Global rate limit window |
| `RATE_LIMIT_AUTH_MAX` | `20` | Auth endpoints rate limit per minute |

`ADMIN_EMAIL` and `ADMIN_PASSWORD` are only used by `pnpm db:seed` and are not required for app startup.

## Bruno collection

Open `bruno/` in [Bruno](https://www.usebruno.com) (pick the `local` environment) or run headless:

```bash
pnpm dev &      # or pnpm start
pnpm bruno:run
```

Requests chain via runtime variables: login stores `accessToken`/`refreshToken`, member requests reuse them.
