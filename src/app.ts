import Fastify, { type FastifyInstance } from 'fastify'
import { serializerCompiler, validatorCompiler } from '@fastify/type-provider-zod'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import { config } from './config/env'
import errorHandler from './plugins/error-handler'
import drizzlePlugin from './plugins/drizzle'
import authPlugin from './plugins/auth'
import rateLimitPlugin from './plugins/rate-limit'
import s3Plugin from './plugins/s3'
import swaggerPlugin from './plugins/swagger'
import authRoutes from './modules/auth/auth.routes'
import memberRoutes from './modules/member/member.routes'
import fileRoutes from './modules/file/file.routes'
import healthRoutes from './routes/health'

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
    disableRequestLogging: false,
  })

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  await app.register(errorHandler)
  await app.register(drizzlePlugin)
  await app.register(authPlugin)
  await app.register(rateLimitPlugin)
  await app.register(s3Plugin)
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