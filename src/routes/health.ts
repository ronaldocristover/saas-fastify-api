import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { sql } from 'drizzle-orm'

// Liveness: process is up. Does not touch the database, so it stays green
// during brief DB outages and keeps the orchestrator from restarting us.
export default async function healthRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  fastify.get('/health', async () => ({ status: 'ok' }))

  // Readiness: dependencies (DB) are reachable. Returning 503 lets the load
  // balancer pull this instance out of rotation until the DB recovers.
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