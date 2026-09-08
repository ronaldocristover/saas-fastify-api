import { Pool } from 'pg'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { config } from '../config/env.js'
import * as schema from './schema.js'

export type AppDb = NodePgDatabase<typeof schema>

// Shared pg pool. Used by the fastify plugin (which decorates app.db with the
// drizzle instance) and by standalone scripts (seed). Exported schema type so
// modules can type their db parameter as NodePgDatabase<typeof schema>.
let pool: Pool | undefined

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: config.DATABASE_URL,
      max: config.DATABASE_POOL_MAX,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
    })
  }
  return pool
}

export function getDb() {
  return drizzle({ client: getPool(), schema })
}

export { schema }