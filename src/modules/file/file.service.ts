import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { PutObjectCommand, GetObjectCommand, type S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createFileRepository, type FileRepository } from './file.repository.js'
import { notFound, forbidden } from '../../common/errors.js'
import { parsePagination } from '../../common/pagination.js'
import type { AuthenticatedUser } from '../../types/auth.js'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export interface FileServiceDeps {
  s3: S3Client
  s3Bucket: string
  s3PresignedExpiry: number
}

export function createFileService(
  db: Parameters<typeof createFileRepository>[0],
  deps: FileServiceDeps,
  repo: FileRepository = createFileRepository(db),
) {
  function buildS3Key(userId: string, originalName: string): string {
    const sanitized = originalName.replace(/[^a-zA-Z0-9._-]/g, '_')
    return `${userId}/${randomUUID()}-${sanitized}`
  }

  return {
    async upload(
      userId: string,
      file: { filepath: string; filename: string; mimetype: string; size: number },
    ) {
      if (file.size > MAX_FILE_SIZE) {
        throw new Error('File exceeds maximum size of 10MB')
      }

      const s3Key = buildS3Key(userId, file.filename)
      const body = createReadStream(file.filepath)

      const command = new PutObjectCommand({
        Bucket: deps.s3Bucket,
        Key: s3Key,
        Body: body,
        ContentType: file.mimetype,
        Metadata: {
          'original-name': file.filename,
          'uploaded-by': userId,
        },
      })

      await deps.s3.send(command)

      return repo.create({
        userId,
        originalName: file.filename,
        mimeType: file.mimetype,
        size: file.size,
        s3Key,
      })
    },

    async getDownloadUrl(requester: AuthenticatedUser, fileId: string) {
      const record = await repo.findById(fileId)
      if (!record) {
        throw notFound('FILE_NOT_FOUND', 'File not found')
      }

      // Members can only get download URLs for their own files
      if (requester.role !== 'admin' && record.userId !== requester.id) {
        throw forbidden('FORBIDDEN', 'You can only access your own files')
      }

      const command = new GetObjectCommand({
        Bucket: deps.s3Bucket,
        Key: record.s3Key,
      })

      const url = await getSignedUrl(deps.s3, command, {
        expiresIn: deps.s3PresignedExpiry,
      })

      return { url, expiresIn: deps.s3PresignedExpiry }
    },

    async list(
      requester: AuthenticatedUser,
      input: { page?: number | null; limit?: number | null },
    ) {
      const page = parsePagination(input.page, input.limit)
      // Admin sees all files; members see only their own
      const userId = requester.role === 'admin' ? undefined : requester.id
      return repo.list({ page, userId })
    },
  }
}

export type FileService = ReturnType<typeof createFileService>
