import fp from 'fastify-plugin'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import fjwt from '@fastify/jwt'
import cookie from '@fastify/cookie'
import { config } from '../config/env.js'
import { forbidden, unauthorized } from '../common/errors.js'
import type { UserRole } from '../types/roles.js'

// Type augmentation lives in src/types/fastify.d.ts: it declares `user` on
// FastifyJWT (consumed by @fastify/jwt to type request.user), plus the
// authenticate/requireRole decorators on FastifyInstance.

// Registers two JWT namespaces:
//   access  - short-lived (15m), carries user id + role, checked on every request
//   refresh - long-lived (7d), used only during token rotation
export default fp(
  async (fastify: FastifyInstance) => {
    // Cookie support is registered because @fastify/jwt references it; this
    // boilerplate delivers refresh tokens in the response body (API-first
    // clients), so no cookie signing secret is needed.
    await fastify.register(cookie)

    await fastify.register(fjwt, {
      namespace: 'access',
      secret: config.JWT_ACCESS_SECRET,
      sign: { expiresIn: config.ACCESS_TOKEN_TTL },
      formatUser: (payload) => ({
        id: payload.sub,
        role: payload.role,
      }),
    })

    await fastify.register(fjwt, {
      namespace: 'refresh',
      secret: config.JWT_REFRESH_SECRET,
      sign: { expiresIn: `${config.REFRESH_TOKEN_TTL_DAYS}d` },
      formatUser: (payload) => ({
        id: payload.sub,
        role: payload.role,
      }),
    })

    // Verify the access token and populate request.user. Throws through the
    // shared error handler as a 401, so routes just declare `onRequest: [authenticate]`.
    fastify.decorate(
      'authenticate',
      async (request: FastifyRequest) => {
        try {
          await request.accessJwtVerify()
        } catch {
          throw unauthorized('UNAUTHORIZED', 'Invalid or expired token')
        }
      },
    )

    // Factory returning a preHandler that enforces a role on request.user.
    fastify.decorate('requireRole', (role: UserRole) => {
      return async (request: FastifyRequest) => {
        if (request.user?.role !== role) {
          throw forbidden('FORBIDDEN', 'Insufficient permissions')
        }
      }
    })
  },
  { name: 'auth', dependencies: ['error-handler'] },
)