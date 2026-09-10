import { createMemberRepository, type MemberRepository } from './member.repository'
import { forbidden } from '../../common/errors'
import { parsePagination } from '../../common/pagination'
import type { UserRole } from '../../types/roles'
import type { AuthenticatedUser } from '../../types/auth'

export function createMemberService(
  db: Parameters<typeof createMemberRepository>[0],
  repo: MemberRepository = createMemberRepository(db),
) {

  return {
    async list(input: { page?: number | null; limit?: number | null; search?: string; role?: UserRole }) {
      const page = parsePagination(input.page, input.limit)
      return repo.list({ page, search: input.search, role: input.role })
    },

    async getById(id: string) {
      return repo.findById(id)
    },

    /**
     * Admin may update any member (including role); members may only update
     * their own fullName. Only admins may change roles.
     */
    async update(
      requester: AuthenticatedUser,
      targetId: string,
      data: { fullName?: string; role?: UserRole },
    ) {
      if (requester.role !== 'admin' && requester.id !== targetId) {
        throw forbidden('FORBIDDEN', 'You can only update your own profile')
      }
      const payload =
        requester.role === 'admin' ? data : { fullName: data.fullName }
      return repo.update(targetId, payload)
    },

    async delete(requester: AuthenticatedUser, targetId: string) {
      if (requester.role !== 'admin') {
        throw forbidden('FORBIDDEN', 'Only admins can delete members')
      }
      await repo.softDelete(targetId)
    },
  }
}