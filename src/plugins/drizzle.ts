import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { getPool, getDb } from '../db/index.js'

declare module 'fastify' {
  interface FastifyInstance {
    db: ReturnType<typeof getDb>
  }
}

// Decorates fastify.db with the Drizzle instance and closes the pg pool on shutdown.
export default fp(
  async (fastify: FastifyInstance) => {
    const db = getDb()
    fastify.decorate('db', db)
    fastify.addHook('onClose', async () => {
      await getPool().end()
    })
  },
  { name: 'drizzle' },
)