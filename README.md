# Fastify API Boilerplate

Security-hardened, production-ready Fastify 5 + PostgreSQL API with layered architecture, JWT auth with atomic refresh token rotation, and comprehensive test coverage.

## Stack

- **Fastify 5** + TypeScript 5.9 (strict, ESM)
- **Bun 1.4** runtime, package manager, and test runner
- **PostgreSQL 17** + Drizzle ORM + drizzle-kit migrations
- **Zod v4** via `@fastify/type-provider-zod` (validation + types from one schema)
- **Auth**: argon2id passwords, JWT access (15m) + rotating refresh tokens (7d, SHA-256 hashed in DB, atomic single-use rotation)
- **Security**: timing-safe login, Pino log redaction, static 404 responses, min-length JWT secrets, Swagger opt-in
- **Observability**: Pino JSON logs (redacted), `/health` + `/ready`, request-ID correlation
- **Docs**: Swagger UI at `/documentation` (requires `SWAGGER_ENABLED=true`)
- **Tests**: Bun test (56 tests across 7 files — unit + integration via testcontainers), Bruno e2e (`@usebruno/cli`)
- **Docker**: Postgres 17 in docker-compose (port 5434), multi-stage production Dockerfile with Bun

## Quick start

```bash
# 1. Start Postgres (runs on port 5434)
docker compose up -d

# 2. Install dependencies
bun install

# 3. Configure environment
cp .env.example .env

# 4. Run migrations + seed
bun run db:migrate
bun run db:seed

# 5. Start dev server
bun run dev
```

The server is now at `http://localhost:3000`. Swagger UI requires `SWAGGER_ENABLED=true` in your `.env`.

Seeded accounts: `admin@example.com` / `admin123456`, `member1..5@example.com` / `password123`.

## Scripts

| Script | Purpose |
|---|---|
| `bun run dev` | Dev server with watch mode |
| `bun run build` / `bun run start` | TypeScript build + production run |
| `bun test` | Unit + integration tests (spins up testcontainers Postgres) |
| `bun run test:unit` / `bun run test:integration` | Run one suite |
| `bun run test:coverage` | Tests + coverage |
| `bun run lint` / `bun run typecheck` | ESLint / tsc |
| `bun run db:generate` | Generate migration from schema changes |
| `bun run db:migrate` | Apply migrations |
| `bun run db:seed` | Seed admin + sample members (idempotent) |
| `bun run db:studio` | Drizzle Studio (DB browser) |
| `bun run bruno:run` | Bruno e2e suite against running server |
| `bun run verify` | lint + typecheck + test |

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
| POST | `/files/upload` | Bearer | Multipart upload to S3 |
| GET | `/files` | Bearer | List files (members: own, admin: all) |
| GET | `/files/:id/download-url` | Bearer | Presigned download URL |
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
    file/              # schemas -> repository -> service -> routes (S3 uploads)
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
- **Total**: 56 tests across 7 files (auth service, member service, pagination, auth integration, member integration, file service, file integration)
- **E2E**: Bruno collection chains login -> authenticated requests via runtime variables

## Docker

`docker-compose.yml` runs Postgres 17 on port 5434 (host-accessible via `127.0.0.1:5434`). The `Dockerfile` uses a multi-stage build: build stage compiles TypeScript and produces a standalone Bun bytecode executable, production stage runs on `oven/bun:1-slim` with only production dependencies.

```bash
docker compose up -d                                # Start Postgres
docker build --platform linux/amd64 -t fastify-api . # Build production image
docker run --env-file .env -p 3000:3000 fastify-api  # Run
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
| `S3_BUCKET` | (required) | S3 bucket name for file uploads |
| `S3_REGION` | `us-east-1` | S3 region |
| `S3_ENDPOINT` | -- | Optional custom endpoint (MinIO, LocalStack) |
| `S3_ACCESS_KEY_ID` | (required) | AWS access key |
| `S3_SECRET_ACCESS_KEY` | (required) | AWS secret key |
| `PRESIGNED_URL_EXPIRY` | `3600` | Presigned URL expiry in seconds |

`ADMIN_EMAIL` and `ADMIN_PASSWORD` are only used by `bun run db:seed` and are not required for app startup.

## Bruno collection

Open `bruno/` in [Bruno](https://www.usebruno.com) (pick the `local` environment) or run headless:

```bash
bun run dev &      # or bun run start
bun run bruno:run
```

Requests chain via runtime variables: login stores `accessToken`/`refreshToken`, member requests reuse them.
