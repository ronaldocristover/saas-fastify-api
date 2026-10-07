import { Pool } from 'pg'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { config } from '../config/env'
import * as schema from './schema'

export type AppDb = NodePgDatabase<typeof schema>

let pool: Pool | undefined

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL ?? config.DATABASE_URL,
      max: config.DATABASE_POOL_MAX,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
    })
  }
  return pool
}

export function closePool(): Promise<void> {
  if (!pool) return Promise.resolve()
  const p = pool
  pool = undefined
  return p.end()
}

export function getDb() {
  return drizzle({ client: getPool(), schema })
}

export { schema }