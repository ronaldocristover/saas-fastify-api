import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import rateLimit from '@fastify/rate-limit'
import { config } from '../config/env'

export default fp(
  async (fastify: FastifyInstance) => {
    await fastify.register(rateLimit, {
      max: config.RATE_LIMIT_MAX,
      timeWindow: config.RATE_LIMIT_TIME_WINDOW,
      addHeadersOnExceeding: { 'x-ratelimit-limit': true, 'x-ratelimit-remaining': true, 'x-ratelimit-reset': true },
      addHeaders: { 'x-ratelimit-limit': true, 'x-ratelimit-remaining': true, 'x-ratelimit-reset': true, 'retry-after': true },
    })
  },
  { name: 'rate-limit' },
)