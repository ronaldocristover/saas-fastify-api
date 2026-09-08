import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAuthService, type AuthService } from '../../src/modules/auth/auth.service.js'
import type { AuthRepositoryShape } from '../../src/modules/auth/auth.service.js'
import { hashPassword } from '../../src/common/password.js'

describe('AuthService', () => {
  let service: AuthService
  let mockRepo: AuthRepositoryShape
  let mockJwt: {
    accessJwtSign: ReturnType<typeof vi.fn>
    refreshJwtSign: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    mockRepo = {
      findByEmail: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      createRefreshToken: vi.fn(),
      findRefreshToken: vi.fn(),
      revokeRefreshToken: vi.fn(),
      revokeIfActive: vi.fn().mockResolvedValue(true),
    }

    mockJwt = {
      // Tokens include a fake dot-separated payload so the service can parse exp.
      accessJwtSign: vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(`header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 900 })).toString('base64url')}.sig`),
        ),
      refreshJwtSign: vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(`header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 7 * 86400 })).toString('base64url')}.sig`),
        ),
    }

    service = createAuthService({} as any, mockJwt, mockRepo)
  })

  describe('register', () => {
    it('should register a new user', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        passwordHash: await hashPassword('password123'),
        fullName: 'Test User',
        role: 'member' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      vi.mocked(mockRepo.findByEmail).mockResolvedValue(undefined)
      vi.mocked(mockRepo.create).mockResolvedValue(mockUser)

      const result = await service.register({
        email: 'test@example.com',
        password: 'password123',
        fullName: 'Test User',
      })

      expect(result.user.email).toBe('test@example.com')
      // Tokens come from the mocked signer as fake-JWT strings; assert shape.
      expect(result.accessToken).toMatch(/^header\..+\.sig$/)
      expect(result.refreshToken).toMatch(/^header\..+\.sig$/)
      expect(mockRepo.createRefreshToken).toHaveBeenCalled()
    })

    it('should throw EMAIL_EXISTS if email already exists', async () => {
      vi.mocked(mockRepo.findByEmail).mockResolvedValue({
        id: 'existing-user',
        email: 'test@example.com',
        passwordHash: await hashPassword('password123'),
        fullName: 'Existing User',
        role: 'member',
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      await expect(
        service.register({
          email: 'test@example.com',
          password: 'password123',
          fullName: 'Test User',
        })
      ).rejects.toThrow('Email is already registered')
    })
  })

  describe('login', () => {
    it('should login with valid credentials', async () => {
      const password = 'password123'
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        passwordHash: await hashPassword(password),
        fullName: 'Test User',
        role: 'member' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      vi.mocked(mockRepo.findByEmail).mockResolvedValue(mockUser)

      const result = await service.login({
        email: 'test@example.com',
        password,
      })

      expect(result.user.email).toBe('test@example.com')
      expect(result.accessToken).toMatch(/^header\..+\.sig$/)
      expect(mockRepo.createRefreshToken).toHaveBeenCalled()
    })

    it('should throw INVALID_CREDENTIALS for wrong password', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        passwordHash: await hashPassword('password123'),
        fullName: 'Test User',
        role: 'member' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      vi.mocked(mockRepo.findByEmail).mockResolvedValue(mockUser)

      await expect(
        service.login({
          email: 'test@example.com',
          password: 'wrongpassword',
        })
      ).rejects.toThrow('Invalid email or password')
    })

    it('should throw INVALID_CREDENTIALS for non-existent email', async () => {
      vi.mocked(mockRepo.findByEmail).mockResolvedValue(undefined)

      await expect(
        service.login({
          email: 'nonexistent@example.com',
          password: 'password123',
        })
      ).rejects.toThrow('Invalid email or password')
    })
  })

  describe('getMe', () => {
    it('should return user profile', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        passwordHash: 'hash',
        fullName: 'Test User',
        role: 'member' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      vi.mocked(mockRepo.findById).mockResolvedValue(mockUser)

      const result = await service.getMe('user-1')

      expect(result.id).toBe('user-1')
      expect(result.email).toBe('test@example.com')
    })

    it('should throw USER_NOT_FOUND if user does not exist', async () => {
      vi.mocked(mockRepo.findById).mockResolvedValue(undefined)

      await expect(service.getMe('nonexistent')).rejects.toThrow('User not found')
    })
  })

  describe('refresh', () => {
    it('should issue new token pair for valid token', async () => {
      const fakeJwt = `header.${Buffer.from(JSON.stringify({ sub: 'user-1', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.sig`
      vi.mocked(mockRepo.revokeIfActive).mockResolvedValue(true)
      vi.mocked(mockRepo.findById).mockResolvedValue({
        id: 'user-1', email: 'test@example.com', passwordHash: 'x', fullName: 'Test', role: 'member' as const, createdAt: new Date(), updatedAt: new Date(), deletedAt: null
      })

      const result = await service.refresh(fakeJwt)
      expect(result.accessToken).toMatch(/^header\..+\.sig$/)
      expect(result.refreshToken).toMatch(/^header\..+\.sig$/)
      expect(mockRepo.revokeIfActive).toHaveBeenCalled()
      expect(mockRepo.createRefreshToken).toHaveBeenCalled()
    })

    it('should throw if token already revoked', async () => {
      const fakeJwt = `header.${Buffer.from(JSON.stringify({ sub: 'user-1', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.sig`
      vi.mocked(mockRepo.revokeIfActive).mockResolvedValue(false)

      await expect(service.refresh(fakeJwt)).rejects.toThrow()
    })
  })

  describe('logout', () => {
    it('should revoke refresh token', async () => {
      const fakeJwt = `header.${Buffer.from(JSON.stringify({ sub: 'user-1' })).toString('base64url')}.sig`
      await service.logout(fakeJwt)
      expect(mockRepo.revokeRefreshToken).toHaveBeenCalled()
    })
  })
})