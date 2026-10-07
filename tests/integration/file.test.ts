import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'bun:test'
import { buildApp } from '../../src/app'
import { Pool } from 'pg'
import type { FastifyInstance } from 'fastify'
import { startTestcontainer } from '../setup/testcontainers'
import { MAX_FILE_SIZE } from '../../src/modules/file/file.service'

function multipartPayload(
  boundary: string,
  filename: string,
  contentType: string,
  content: Buffer | string,
): Buffer {
  return Buffer.concat([
    Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        `Content-Type: ${contentType}\r\n\r\n`,
    ),
    Buffer.isBuffer(content) ? content : Buffer.from(content),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])
}

describe('File API', () => {
  let app: FastifyInstance
  let pool: Pool
  let userToken: string
  let userId: string

  beforeAll(async () => {
    await startTestcontainer()
    pool = new Pool({ connectionString: process.env.DATABASE_URL })
    app = await buildApp()

    const originalSend = app.s3.send.bind(app.s3)
    app.s3.send = vi.fn().mockImplementation(async (command: any) => {
      if (command.constructor?.name === 'PutObjectCommand') {
        return { ETag: '"mock-etag"' }
      }
      return originalSend(command)
    }) as any

    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    await pool.end()
  })

  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE users, refresh_tokens, files CASCADE')

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'uploader@example.com',
        password: 'password123',
        fullName: 'Uploader',
      },
    })
    userToken = res.json().data.accessToken
    userId = res.json().data.user.id
  })

  describe('POST /api/v1/files/upload', () => {
    it('should upload a file and return metadata', async () => {
      const boundary = '----TestBoundary'
      const body = multipartPayload(boundary, 'hello.txt', 'text/plain', 'Hello, World!')

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/files/upload',
        headers: {
          authorization: `Bearer ${userToken}`,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      })

      expect(response.statusCode).toBe(201)
      const json = response.json()
      expect(json.data).toHaveProperty('id')
      expect(json.data.originalName).toBe('hello.txt')
      expect(json.data.mimeType).toBe('text/plain')
      expect(json.data.userId).toBe(userId)
      expect(json.data.size).toBeGreaterThan(0)
    })

    it('should reject uploads over the 10MB limit with 413 FILE_TOO_LARGE', async () => {
      const boundary = '----BigBoundary'
      const payload = multipartPayload(
        boundary,
        'big.bin',
        'application/octet-stream',
        Buffer.alloc(MAX_FILE_SIZE + 1),
      )

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/files/upload',
        headers: {
          authorization: `Bearer ${userToken}`,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      })

      expect(response.statusCode).toBe(413)
      expect(response.json().error.code).toBe('FILE_TOO_LARGE')
    })

    it('should reject unauthenticated uploads', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/files/upload',
      })
      expect(response.statusCode).toBe(401)
    })
  })

  describe('GET /api/v1/files', () => {
    it('should list files for authenticated user', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/files',
        headers: { authorization: `Bearer ${userToken}` },
      })

      expect(response.statusCode).toBe(200)
      const json = response.json()
      expect(json.data).toBeInstanceOf(Array)
      expect(json.meta).toHaveProperty('total')
    })

    it('should reject unauthenticated list requests', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/files',
      })
      expect(response.statusCode).toBe(401)
    })
  })

  describe('GET /api/v1/files/:id/download-url', () => {
    it('should return a presigned URL for own file', async () => {
      const boundary = '----TestBoundary'
      const body = multipartPayload(boundary, 'doc.pdf', 'application/pdf', 'pdf-content')

      const uploadRes = await app.inject({
        method: 'POST',
        url: '/api/v1/files/upload',
        headers: {
          authorization: `Bearer ${userToken}`,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      })
      const fileId = uploadRes.json().data.id

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/files/${fileId}/download-url`,
        headers: { authorization: `Bearer ${userToken}` },
      })

      expect(response.statusCode).toBe(200)
      const json = response.json()
      expect(json.data.url).toBeTypeOf('string')
      expect(json.data.url.length).toBeGreaterThan(0)
      expect(json.data.expiresIn).toBe(3600)
    })

    it('should return 404 for nonexistent file', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/files/${fakeId}/download-url`,
        headers: { authorization: `Bearer ${userToken}` },
      })

      expect(response.statusCode).toBe(404)
    })
  })
})
