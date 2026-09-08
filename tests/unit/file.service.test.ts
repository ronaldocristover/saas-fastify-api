import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFileService } from '../../src/modules/file/file.service.js'
import type { FileRepository } from '../../src/modules/file/file.repository.js'

// Mock repository
vi.mock('../../src/modules/file/file.repository.js', () => ({
  createFileRepository: vi.fn(),
}))

// Mock presigner
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/signed'),
}))

// Mock fs for createReadStream
vi.mock('node:fs', () => ({
  createReadStream: vi.fn().mockReturnValue({
    pipe: vi.fn(),
    on: vi.fn(),
  }),
}))

describe('FileService', () => {
  let service: ReturnType<typeof createFileService>
  let mockRepo: FileRepository
  let mockS3Send: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      list: vi.fn(),
      deleteById: vi.fn(),
    }

    mockS3Send = vi.fn().mockResolvedValue({})

    service = createFileService(
      {} as any,
      {
        s3: { send: mockS3Send } as any,
        s3Bucket: 'test-bucket',
        s3PresignedExpiry: 3600,
      },
      mockRepo,
    )
  })

  describe('upload', () => {
    it('should upload file to S3 and save metadata', async () => {
      const mockFile = {
        id: 'file-uuid',
        userId: 'user-1',
        originalName: 'test.txt',
        mimeType: 'text/plain',
        size: 1024,
        createdAt: new Date().toISOString(),
      }

      vi.mocked(mockRepo.create).mockResolvedValue(mockFile)
      mockS3Send.mockResolvedValue({ ETag: '"etag"' })

      const result = await service.upload('user-1', {
        filepath: '/tmp/test.txt',
        filename: 'test.txt',
        mimetype: 'text/plain',
        size: 1024,
      })

      expect(mockS3Send).toHaveBeenCalledOnce()
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          originalName: 'test.txt',
          mimeType: 'text/plain',
          size: 1024,
        }),
      )
      expect(result.originalName).toBe('test.txt')
      expect(result.userId).toBe('user-1')
    })
  })

  describe('getDownloadUrl', () => {
    it('should generate presigned URL for own file', async () => {
      const mockFile = {
        id: 'file-1',
        userId: 'user-1',
        originalName: 'test.txt',
        mimeType: 'text/plain',
        size: 1024,
        createdAt: new Date().toISOString(),
        s3Key: 'user-1/abc-test.txt',
      }

      vi.mocked(mockRepo.findById).mockResolvedValue(mockFile)

      const result = await service.getDownloadUrl(
        { id: 'user-1', role: 'member' },
        'file-1',
      )

      expect(result.url).toBe('https://s3.example.com/signed')
      expect(result.expiresIn).toBe(3600)
    })

    it('should deny access to other users files', async () => {
      const mockFile = {
        id: 'file-1',
        userId: 'user-2',
        originalName: 'test.txt',
        mimeType: 'text/plain',
        size: 1024,
        createdAt: new Date().toISOString(),
        s3Key: 'user-2/abc-test.txt',
      }

      vi.mocked(mockRepo.findById).mockResolvedValue(mockFile)

      await expect(
        service.getDownloadUrl({ id: 'user-1', role: 'member' }, 'file-1'),
      ).rejects.toThrow('You can only access your own files')
    })

    it('should allow admin to access any file', async () => {
      const mockFile = {
        id: 'file-1',
        userId: 'user-2',
        originalName: 'test.txt',
        mimeType: 'text/plain',
        size: 1024,
        createdAt: new Date().toISOString(),
        s3Key: 'user-2/abc-test.txt',
      }

      vi.mocked(mockRepo.findById).mockResolvedValue(mockFile)

      const result = await service.getDownloadUrl(
        { id: 'admin-1', role: 'admin' },
        'file-1',
      )

      expect(result.url).toBeDefined()
      expect(result.expiresIn).toBe(3600)
    })

    it('should throw if file not found', async () => {
      vi.mocked(mockRepo.findById).mockResolvedValue(undefined)

      await expect(
        service.getDownloadUrl({ id: 'user-1', role: 'member' }, 'nonexistent'),
      ).rejects.toThrow('File not found')
    })
  })

  describe('list', () => {
    it('should return paginated files for member (own only)', async () => {
      vi.mocked(mockRepo.list).mockResolvedValue({
        data: [],
        meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
      })

      await service.list({ id: 'user-1', role: 'member' }, {})

      expect(mockRepo.list).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1' }),
      )
    })

    it('should return all files for admin', async () => {
      vi.mocked(mockRepo.list).mockResolvedValue({
        data: [],
        meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
      })

      await service.list({ id: 'admin-1', role: 'admin' }, {})

      expect(mockRepo.list).toHaveBeenCalledWith(
        expect.objectContaining({ userId: undefined }),
      )
    })
  })
})
