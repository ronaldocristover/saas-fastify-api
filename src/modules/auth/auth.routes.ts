import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import { createAuthRepository } from './auth.repository'
import { createAuthService } from './auth.service'
import { forbidden, unauthorized } from '../../common/errors'
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
  meSchema,
} from './auth.schemas'
import { config } from '../../config/env'

const authRateLimit = {
  max: config.RATE_LIMIT_AUTH_MAX,
  timeWindow: config.RATE_LIMIT_TIME_WINDOW,
}

export default async function authRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  // The service signs via the JWT namespace map (`fastify.jwt.access.sign`).
  // @fastify/jwt exposes instance-level signers there, returning Promises
  // (JwtSignFunction); the reply-level name decorators are for handlers only.
  const service = createAuthService(
    fastify.db,
    {
      accessJwtSign: (payload: object): Promise<string> =>
        Promise.resolve(fastify.jwt.access.sign(payload as { sub: string; role: 'member' | 'admin' })),
      refreshJwtSign: (payload: object): Promise<string> =>
        Promise.resolve(fastify.jwt.refresh.sign(payload as { sub: string; role: 'member' | 'admin'; jti: string })),
    },
    createAuthRepository(fastify.db),
  )

  // POST /register
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/register',
    schema: registerSchema,
    config: { rateLimit: authRateLimit },
    handler: async (request, reply) => {
      const result = await service.register(request.body)
      return reply.code(201).send({ data: result })
    },
  })

  // POST /login
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/login',
    schema: loginSchema,
    config: { rateLimit: authRateLimit },
    handler: async (request, reply) => {
      const result = await service.login(request.body)
      return reply.send({ data: result })
    },
  })

  // POST /refresh
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/refresh',
    schema: refreshSchema,
    config: { rateLimit: authRateLimit },
    handler: async (request, reply) => {
      const result = await service.refresh(request.body.refreshToken)
      return reply.send({ data: result })
    },
  })

  // POST /logout (requires auth: only your own session should be revocable)
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/logout',
    schema: logoutSchema,
    onRequest: [fastify.authenticate],
    handler: async (request, reply) => {
      const refreshToken = request.body.refreshToken
      // Verify refresh token belongs to the authenticated user
      const [, payloadB64] = refreshToken.split('.')
      if (!payloadB64) throw unauthorized('INVALID_TOKEN', 'Invalid refresh token')
      let sub: string
      try {
        const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as { sub: string }
        sub = payload.sub
      } catch { throw unauthorized('INVALID_TOKEN', 'Invalid refresh token') }
      if (sub !== request.user.id) throw forbidden('FORBIDDEN', 'Refresh token does not belong to you')
      await service.logout(refreshToken)
      return reply.code(204).send()
    },
  })

  // GET /me (requires auth)
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: 'GET',
    url: '/me',
    schema: meSchema,
    onRequest: [fastify.authenticate],
    handler: async (request) => {
      const user = await service.getMe(request.user.id)
      return { data: user }
    },
  })
}