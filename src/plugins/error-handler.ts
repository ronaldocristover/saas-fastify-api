import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { hasZodFastifySchemaValidationErrors } from '@fastify/type-provider-zod'
import { AppError } from '../common/errors'

// Unified error envelope: { error: { code, message, details? } }.
interface ErrorBody {
  error: { code: string; message: string; details?: unknown }
}

export default fp(
  async (fastify: FastifyInstance) => {
    fastify.setErrorHandler((error: unknown, request, reply) => {
      if (error instanceof AppError) {
        const body: ErrorBody = { error: { code: error.code, message: error.message } }
        if (error.details !== undefined) body.error.details = error.details
        return reply.code(error.statusCode).send(body)
      }

      // The Zod type provider reports route validation as a FastifyError with
      // a zod-specific `validation` array.
      if (hasZodFastifySchemaValidationErrors(error)) {
        const body: ErrorBody = {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details: error.validation,
          },
        }
        return reply.code(422).send(body)
      }

      // Framework errors (4xx): rate-limit 429, malformed JSON, etc.
      const statusCode = (error as { statusCode?: number }).statusCode ?? 500
      if (statusCode >= 400 && statusCode < 500) {
        const err = error as { code?: string; message?: string }
        const body: ErrorBody = {
          error: { code: err.code ?? 'BAD_REQUEST', message: err.message ?? 'Request failed' },
        }
        return reply.code(statusCode).send(body)
      }

      request.log.error({ err: error }, 'unhandled error')
      const body: ErrorBody = {
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' },
      }
      return reply.code(500).send(body)
    })

    fastify.setNotFoundHandler((request, reply) => {
      const body: ErrorBody = {
        error: { code: 'NOT_FOUND', message: 'Route not found' },
      }
      return reply.code(404).send(body)
    })
  },
  { name: 'error-handler' },
)