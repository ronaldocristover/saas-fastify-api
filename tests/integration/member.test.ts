import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test'
import { buildApp } from '../../src/app.js'
import { Pool } from 'pg'
import type { FastifyInstance } from 'fastify'
import { startTestcontainer } from '../setup/testcontainers.js'


describe('Member API', () => {
  let app: FastifyInstance
  let pool: Pool

  beforeAll(async () => {
    // Idempotent: starts the container on first call in the process, resolves
    // immediately afterwards. The preload skips it unless PG_TEST=1 (bunfig
    // preload gets no argv, so it cannot detect which files will run).
    await startTestcontainer()
    pool = new Pool({ connectionString: process.env.DATABASE_URL })
    app = await buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    await pool.end()
    // Container teardown is handled by Ryuk when the test process exits; the
    // preload owns the lifecycle for multi-file runs.
  })

  // Reset state before each test AND (re)create the admin + member used by
  // every scenario, since beforeEach truncation wipes the beforeAll fixtures.
  let adminToken: string
  let memberToken: string
  let memberId: string

  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE users, refresh_tokens CASCADE')

    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'admin@example.com',
        password: 'admin123456',
        fullName: 'Admin User',
      },
    })
    // Promote the freshly created admin account, then log in again so the
    // access token carries the admin role claim.
    await pool.query("UPDATE users SET role = 'admin' WHERE email = 'admin@example.com'")
    const adminLoginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'admin@example.com', password: 'admin123456' },
    })
    adminToken = adminLoginRes.json().data.accessToken

    const memberRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'member@example.com',
        password: 'member123456',
        fullName: 'Member User',
      },
    })
    memberToken = memberRes.json().data.accessToken
    memberId = memberRes.json().data.user.id
  })

  describe('GET /api/v1/members', () => {
    it('should allow admin to list members', async () => {
      // Create some more members
      for (let i = 1; i <= 3; i++) {
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/register',
          payload: {
            email: `member${i}@example.com`,
            password: 'password123',
            fullName: `Member ${i}`,
          },
        })
      }

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/members',
        headers: { authorization: `Bearer ${adminToken}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.data).toBeInstanceOf(Array)
      expect(body.meta.total).toBeGreaterThanOrEqual(3)
    })

    it('should not allow member to list members', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/members',
        headers: { authorization: `Bearer ${memberToken}` },
      })

      expect(response.statusCode).toBe(403)
    })
  })

  describe('GET /api/v1/members/:id', () => {
    it('should return member by id', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/members/${memberId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().data.id).toBe(memberId)
    })

    it('should return 404 for non-existent member', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/members/00000000-0000-0000-0000-000000000000',
        headers: { authorization: `Bearer ${adminToken}` },
      })

      expect(response.statusCode).toBe(404)
    })
  })

  describe('PATCH /api/v1/members/:id', () => {
    it('should allow admin to update member', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/members/${memberId}`,
        payload: { fullName: 'Updated Name' },
        headers: { authorization: `Bearer ${adminToken}` },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().data.fullName).toBe('Updated Name')
    })

    it('should allow member to update themselves', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/members/${memberId}`,
        payload: { fullName: 'Self Updated' },
        headers: { authorization: `Bearer ${memberToken}` },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().data.fullName).toBe('Self Updated')
    })
  })

  describe('DELETE /api/v1/members/:id', () => {
    it('should allow admin to delete member', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/members/${memberId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      })

      expect(response.statusCode).toBe(204)

      // Verify member is soft deleted
      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/v1/members/${memberId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      })
      expect(getResponse.statusCode).toBe(404)
    })

    it('should not allow member to delete others', async () => {
      const otherRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'other@example.com',
          password: 'password123',
          fullName: 'Other User',
        },
      })
      const otherId = otherRes.json().data.user.id

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/members/${otherId}`,
        headers: { authorization: `Bearer ${memberToken}` },
      })

      expect(response.statusCode).toBe(403)
    })
  })
})