import fp from 'fastify-plugin'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import fjwt from '@fastify/jwt'
import cookie from '@fastify/cookie'
import { config } from '../config/env'
import { forbidden, unauthorized } from '../common/errors'
import type { UserRole } from '../types/roles'

export default fp(
  async (fastify: FastifyInstance) => {
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