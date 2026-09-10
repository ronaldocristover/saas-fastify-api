import { Pool } from 'pg'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { config } from '../config/env'
import * as schema from './schema'

export type AppDb = NodePgDatabase<typeof schema>

// Shared pg pool. Used by the fastify plugin (which decorates app.db with the
// drizzle instance) and by standalone scripts (seed). Exported schema type so
// modules can type their db parameter as NodePgDatabase<typeof schema>.
//
// The pool is created lazily from the CURRENT process.env/config on first use.
// Tests (and multi-app processes) may close the pool via app.close(); the next
// getPool() call then rebuilds it instead of failing with "Cannot use a pool
// after calling end on the pool".
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