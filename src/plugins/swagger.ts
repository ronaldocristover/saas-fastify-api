import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { jsonSchemaTransform } from '@fastify/type-provider-zod'

// OpenAPI docs generated from the same Zod schemas used for validation.
// Disabled in production unless SWAGGER_ENABLED=true.
export default fp(
  async (fastify: FastifyInstance) => {
    await fastify.register(swagger, {
      openapi: {
        info: {
          title: 'Fastify API Boilerplate',
          description: 'Production-ready Fastify + PostgreSQL API',
          version: '0.1.0',
        },
        servers: [{ url: '/' }],
        security: [],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
            },
          },
        },
      },
      transform: jsonSchemaTransform,
    })

    await fastify.register(swaggerUi, {
      routePrefix: '/documentation',
    })
  },
  { name: 'swagger' },
)