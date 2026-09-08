import type { Pool } from 'pg'
import { buildApp } from '../../src/app.js'
import type { FastifyInstance } from 'fastify'

export async function buildTestApp(): Promise<FastifyInstance> {
  return buildApp()
}

export async function truncateAll(pool: Pool) {
  await pool.query('TRUNCATE TABLE users, refresh_tokens, files CASCADE')
}
