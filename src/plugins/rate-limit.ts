import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import rateLimit from '@fastify/rate-limit'
import { config } from '../config/env.js'

// Global rate limit (300 req/min by default). Individual routes can override
// via routeOptions.config.rateLimit. The in-memory store is per-process only;
// swap to @fastify/rate-limit-redis in production clusters if needed.
export default fp(
  async (fastify: FastifyInstance) => {
    await fastify.register(rateLimit, {
      max: config.RATE_LIMIT_MAX,
      timeWindow: config.RATE_LIMIT_TIME_WINDOW,
      addHeadersOnExceeding: { 'x-ratelimit-limit': true, 'x-ratelimit-remaining': true, 'x-ratelimit-reset': true },
      addHeaders: { 'x-ratelimit-limit': true, 'x-ratelimit-remaining': true, 'x-ratelimit-reset': true, 'retry-after': true },
      // 429 responses use the error-handler plugin's envelope.
    })
  },
  { name: 'rate-limit' },
)