import type { FastifyJwtNamespace } from '@fastify/jwt'
import type { UserRole } from './roles'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; role: UserRole }
    user: { id: string; role: UserRole }
    namespaces: 'access' | 'refresh'
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    user: { id: string; role: UserRole }
    accessJwtVerify: FastifyJwtNamespace<{ namespace: 'access' }>['accessJwtVerify']
  }

  interface FastifyReply {
    accessJwtSign: FastifyJwtNamespace<{ namespace: 'access' }>['accessJwtSign']
    refreshJwtSign: FastifyJwtNamespace<{ namespace: 'refresh' }>['refreshJwtSign']
  }

  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    requireRole: (role: UserRole) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}