import type { FastifyJwtNamespace } from '@fastify/jwt'
import type { UserRole } from './roles.js'

declare module '@fastify/jwt' {
  /**
   * Typed JWT payload and decoded user. @fastify/jwt reads the `user` type
   * from here and exposes it as `request.user` after verification.
   */
  interface FastifyJWT {
    payload: { sub: string; role: UserRole }
    user: { id: string; role: UserRole }
    // Declares the registered namespace names so `fastify.jwt` is typed as a
    // namespace -> JWT map, matching the runtime shape of plugins/auth.ts.
    namespaces: 'access' | 'refresh'
  }
}

declare module 'fastify' {
  // Namespaced JWT decorators created at runtime by @fastify/jwt:
  //   fastify.jwt.access / fastify.jwt.refresh (JWT maps)
  //   request.accessJwtVerify / reply.accessJwtSign / reply.refreshJwtSign
  interface FastifyRequest {
    /** Populated by fastify.authenticate from the access token claims. */
    user: { id: string; role: UserRole }
    accessJwtVerify: FastifyJwtNamespace<{ namespace: 'access' }>['accessJwtVerify']
  }

  interface FastifyReply {
    accessJwtSign: FastifyJwtNamespace<{ namespace: 'access' }>['accessJwtSign']
    refreshJwtSign: FastifyJwtNamespace<{ namespace: 'refresh' }>['refreshJwtSign']
  }

  interface FastifyInstance {
    /** preHandler that verifies the access JWT and populates request.user. */
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    /** preHandler factory that requires a specific role on request.user. */
    requireRole: (role: UserRole) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}