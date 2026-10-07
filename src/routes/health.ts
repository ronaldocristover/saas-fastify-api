import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { sql } from 'drizzle-orm'

export default async function healthRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  fastify.get('/health', async () => ({ status: 'ok' }))

  fastify.get('/ready', async (_request, reply) => {
    try {
      await fastify.db.execute(sql`SELECT 1`)
      return { status: 'ok' }
    } catch (err) {
      fastify.log.error({ err }, 'readiness check failed')
      return reply.code(503).send({ status: 'error' })
    }
  })
}