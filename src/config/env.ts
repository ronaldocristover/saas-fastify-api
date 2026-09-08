import { z } from 'zod/v4'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  SWAGGER_ENABLED: z.stringbool().default(false),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_TIME_WINDOW: z.string().default('1 minute'),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().positive().default(20),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  // S3 file storage
  S3_BUCKET: z.string().min(1),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  PRESIGNED_URL_EXPIRY: z.coerce.number().int().positive().default(3600),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error(
    'Invalid environment configuration:',
    z.treeifyError(parsed.error),
  )
  process.exit(1)
}

export const config = parsed.data
export type Config = typeof config