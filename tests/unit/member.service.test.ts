import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMemberService } from '../../src/modules/member/member.service.js'
import type { MemberRepository } from '../../src/modules/member/member.repository.js'
import { notFound } from '../../src/common/errors.js'

// Mock repository
vi.mock('../../src/modules/member/member.repository.js', () => ({
  createMemberRepository: vi.fn(),
}))

describe('MemberService', () => {
  let service: ReturnType<typeof createMemberService>
  let mockRepo: MemberRepository

  beforeEach(() => {
    mockRepo = {
      list: vi.fn(),
      findById: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
    }

    service = createMemberService({} as any, mockRepo)
  })

  describe('list', () => {
    it('should return paginated members', async () => {
      const mockMembers = [
        { id: '1', email: 'a@test.com', fullName: 'A', role: 'member' as const, createdAt: new Date(), updatedAt: new Date() },
        { id: '2', email: 'b@test.com', fullName: 'B', role: 'admin' as const, createdAt: new Date(), updatedAt: new Date() },
      ]

      vi.mocked(mockRepo.list).mockResolvedValue({
        data: mockMembers,
        meta: { page: 1, limit: 20, total: 2, totalPages: 1 },
      })

      const result = await service.list({})

      expect(result.data).toHaveLength(2)
      expect(result.meta.total).toBe(2)
    })
  })

  describe('getById', () => {
    it('should return member by id', async () => {
      const mockMember = {
        id: '1',
        email: 'a@test.com',
        fullName: 'A',
        role: 'member' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      vi.mocked(mockRepo.findById).mockResolvedValue(mockMember)

      const result = await service.getById('1')

      expect(result.id).toBe('1')
    })

    it('should throw if member not found', async () => {
      vi.mocked(mockRepo.findById).mockRejectedValue(notFound('MEMBER_NOT_FOUND', 'Member not found'))

      await expect(service.getById('nonexistent')).rejects.toThrow('Member not found')
    })
  })

  describe('update', () => {
    it('should allow admin to update any member', async () => {
      const requester = { id: 'admin-1', role: 'admin' as const }
      const mockMember = {
        id: '1',
        email: 'a@test.com',
        fullName: 'Updated Name',
        role: 'member' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      vi.mocked(mockRepo.update).mockResolvedValue(mockMember)

      const result = await service.update(requester, '1', { fullName: 'Updated Name' })

      expect(result.fullName).toBe('Updated Name')
    })

    it('should allow member to update themselves', async () => {
      const requester = { id: '1', role: 'member' as const }
      const mockMember = {
        id: '1',
        email: 'a@test.com',
        fullName: 'Updated Name',
        role: 'member' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      vi.mocked(mockRepo.update).mockResolvedValue(mockMember)

      const result = await service.update(requester, '1', { fullName: 'Updated Name' })

      expect(result.fullName).toBe('Updated Name')
    })

    it('should not allow member to update others', async () => {
      const requester = { id: '1', role: 'member' as const }

      await expect(
        service.update(requester, '2', { fullName: 'Hacked' })
      ).rejects.toThrow('You can only update your own profile')
    })
  })

  describe('delete', () => {
    it('should allow admin to delete members', async () => {
      const requester = { role: 'admin' as const }

      vi.mocked(mockRepo.softDelete).mockResolvedValue(undefined)

      await expect(service.delete(requester, '1')).resolves.not.toThrow()
    })

    it('should not allow member to delete others', async () => {
      const requester = { role: 'member' as const }

      await expect(service.delete(requester, '1')).rejects.toThrow('Only admins can delete members')
    })
  })
})
