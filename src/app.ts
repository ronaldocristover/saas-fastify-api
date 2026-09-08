import Fastify, { type FastifyInstance } from 'fastify'
import { serializerCompiler, validatorCompiler } from '@fastify/type-provider-zod'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import { config } from './config/env.js'
import errorHandler from './plugins/error-handler.js'
import drizzlePlugin from './plugins/drizzle.js'
import authPlugin from './plugins/auth.js'
import rateLimitPlugin from './plugins/rate-limit.js'
import s3Plugin from './plugins/s3.js'
import swaggerPlugin from './plugins/swagger.js'
import authRoutes from './modules/auth/auth.routes.js'
import memberRoutes from './modules/member/member.routes.js'
import fileRoutes from './modules/file/file.routes.js'
import healthRoutes from './routes/health.js'

// Builds the fully-wired Fastify instance without listening. Tests reuse this
// via app.inject(); server.ts calls it and then starts the listener.
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      redact: {
        paths: ['req.headers.authorization', 'req.body.password', 'req.body.refreshToken'],
        remove: true,
      },
    },
    requestIdHeader: 'x-request-id',
    // Fires for 4xx/5xx responses so request-level failures reach the log
    // stream with request id, method, url and status attached.
    disableRequestLogging: false,
  })

  // Use the Zod type provider's compilers so route schemas (zod objects) are
  // validated/serialized by zod itself rather than fastify's default Ajv.
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  // Plugin order matters: error handler first (so later plugins' errors use
  // the unified envelope), drizzle + auth before routes, swagger before any
  // route registration so its onRoute hook captures all endpoints.
  await app.register(errorHandler)
  await app.register(drizzlePlugin)
  await app.register(authPlugin)
  await app.register(rateLimitPlugin)
  await app.register(s3Plugin)
  // CORS + Helmet are hardening defaults; CORS origin is env-configurable.
  await app.register(cors, { origin: config.CORS_ORIGIN.split(',') })
  await app.register(helmet, { contentSecurityPolicy: false })
  if (config.SWAGGER_ENABLED) {
    await app.register(swaggerPlugin)
  }

  await app.register(authRoutes, { prefix: '/api/v1/auth' })
  await app.register(memberRoutes, { prefix: '/api/v1/members' })
  await app.register(fileRoutes, { prefix: '/api/v1/files' })
  await app.register(healthRoutes)

  await app.ready()
  return app
}