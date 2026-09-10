import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import { createMemberService } from './member.service'
import {
  listMembersSchema,
  getMemberSchema,
  updateMemberSchema,
  deleteMemberSchema,
} from './member.schemas'

export default async function memberRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  const service = createMemberService(fastify.db)

  // GET / (admin only, paginated)
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: 'GET',
    url: '/',
    schema: listMembersSchema,
    onRequest: [fastify.authenticate, fastify.requireRole('admin')],
    handler: async (request) => {
      const { page, limit, search, role } = request.query
      return service.list({ page, limit, search, role })
    },
  })

  // GET /:id (any authenticated user)
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: 'GET',
    url: '/:id',
    schema: getMemberSchema,
    onRequest: [fastify.authenticate],
    handler: async (request) => {
      const member = await service.getById(request.params.id)
      return { data: member }
    },
  })

  // PATCH /:id (admin: any member incl. role; self: own fullName)
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: 'PATCH',
    url: '/:id',
    schema: updateMemberSchema,
    onRequest: [fastify.authenticate],
    handler: async (request) => {
      const member = await service.update(request.user, request.params.id, request.body)
      return { data: member }
    },
  })

  // DELETE /:id (admin only, soft delete)
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: 'DELETE',
    url: '/:id',
    schema: deleteMemberSchema,
    onRequest: [fastify.authenticate, fastify.requireRole('admin')],
    handler: async (request, reply) => {
      await service.delete(request.user, request.params.id)
      return reply.code(204).send()
    },
  })
}