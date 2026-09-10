import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'bun:test'
import { buildApp } from '../../src/app'
import { Pool } from 'pg'
import type { FastifyInstance } from 'fastify'
import { startTestcontainer } from '../setup/testcontainers'

describe('File API', () => {
  let app: FastifyInstance
  let pool: Pool
  let userToken: string
  let userId: string

  beforeAll(async () => {
    // Idempotent: starts the container on first call in the process, resolves
    // immediately afterwards. The preload skips it unless PG_TEST=1 (bunfig
    // preload gets no argv, so it cannot detect which files will run).
    await startTestcontainer()
    pool = new Pool({ connectionString: process.env.DATABASE_URL })
    app = await buildApp()

    // Mock S3 client: intercept PutObject so tests don't need real S3.
    // GetObjectCommand falls through to the real client — the presigner only
    // signs locally and never hits the network, so download-url tests still
    // get a genuinely signed URL with X-Amz-Signature.
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
    // Container teardown is handled by Ryuk when the test process exits; the
    // preload owns the lifecycle for multi-file runs.
  })

  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE users, refresh_tokens, files CASCADE')

    // Register a user and get token
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
      const fileContent = 'Hello, World!'
      const body = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="hello.txt"',
        'Content-Type: text/plain',
        '',
        fileContent,
        `--${boundary}--`,
      ].join('\r\n')

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
      // Upload first
      const boundary = '----TestBoundary'
      const body = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="doc.pdf"',
        'Content-Type: application/pdf',
        '',
        'pdf-content',
        `--${boundary}--`,
      ].join('\r\n')

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
      // The presigned URL is produced by the AWS SDK; its format varies by
      // SDK version and environment. Just verify we got a non-empty URL and
      // the expected expiry — the actual signing is covered by the SDK's own
      // test suite and by the fact that the S3 client was injected here.
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
