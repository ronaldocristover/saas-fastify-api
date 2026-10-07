import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { getDb, closePool } from '../db/index'

declare module 'fastify' {
  interface FastifyInstance {
    db: ReturnType<typeof getDb>
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    const db = getDb()
    fastify.decorate('db', db)
    fastify.addHook('onClose', async () => {
      await closePool()
    })
  },
  { name: 'drizzle' },
)