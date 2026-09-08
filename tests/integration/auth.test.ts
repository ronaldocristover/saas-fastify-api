import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { Pool } from 'pg'
import type { FastifyInstance } from 'fastify'

describe('Auth API', () => {
  let app: FastifyInstance
  let pool: Pool

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL })
    app = await buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    await pool.end()
  })

  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE users, refresh_tokens CASCADE')
  })

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'test@example.com',
          password: 'password123',
          fullName: 'Test User',
        },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.data.user.email).toBe('test@example.com')
      expect(body.data.accessToken).toBeDefined()
      expect(body.data.refreshToken).toBeDefined()
    })

    it('should return 409 if email already exists', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'test@example.com',
          password: 'password123',
          fullName: 'Test User',
        },
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'test@example.com',
          password: 'password123',
          fullName: 'Another User',
        },
      })

      expect(response.statusCode).toBe(409)
      expect(response.json().error.code).toBe('EMAIL_EXISTS')
    })

    it('should return 422 for invalid input', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'invalid',
          password: '123',
          fullName: '',
        },
      })

      expect(response.statusCode).toBe(422)
    })
  })

  describe('POST /api/v1/auth/login', () => {
    it('should login with valid credentials', async () => {
      // Register first
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'test@example.com',
          password: 'password123',
          fullName: 'Test User',
        },
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'test@example.com',
          password: 'password123',
        },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.data.user.email).toBe('test@example.com')
      expect(body.data.accessToken).toBeDefined()
    })

    it('should return 401 for invalid credentials', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'test@example.com',
          password: 'password123',
          fullName: 'Test User',
        },
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'test@example.com',
          password: 'wrongpassword',
        },
      })

      expect(response.statusCode).toBe(401)
      expect(response.json().error.code).toBe('INVALID_CREDENTIALS')
    })
  })

  describe('GET /api/v1/auth/me', () => {
    it('should return current user', async () => {
      // Register and get token
      const registerResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'test@example.com',
          password: 'password123',
          fullName: 'Test User',
        },
      })
      const { accessToken } = registerResponse.json().data

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().data.email).toBe('test@example.com')
    })

    it('should return 401 without token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
      })

      expect(response.statusCode).toBe(401)
    })
  })

  describe('Health endpoints', () => {
    it('GET /health returns 200', async () => {
      const response = await app.inject({ method: 'GET', url: '/health' })
      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ status: 'ok' })
    })

    it('GET /ready returns 200 when DB is up', async () => {
      const response = await app.inject({ method: 'GET', url: '/ready' })
      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ status: 'ok' })
    })
  })

  describe('POST /api/v1/auth/refresh', () => {
    it('should return new token pair for valid refresh token', async () => {
      await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { email: 'ref@test.com', password: 'password123', fullName: 'Ref User' } })
      const loginRes = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'ref@test.com', password: 'password123' } })
      const refreshToken = loginRes.json().data.refreshToken

      const response = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken } })
      expect(response.statusCode).toBe(200)
      expect(response.json().data).toHaveProperty('accessToken')
      expect(response.json().data).toHaveProperty('refreshToken')
    })

    it('should return 401 for already-revoked refresh token', async () => {
      await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { email: 'revoke@test.com', password: 'password123', fullName: 'Revoke User' } })
      const loginRes = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'revoke@test.com', password: 'password123' } })
      const refreshToken = loginRes.json().data.refreshToken
      // Use it once
      await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken } })
      // Try again — should fail
      const response = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken } })
      expect(response.statusCode).toBe(401)
    })
  })

  describe('POST /api/v1/auth/logout', () => {
    it('should revoke refresh token and make it unusable', async () => {
      await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { email: 'logout@test.com', password: 'password123', fullName: 'Logout User' } })
      const loginRes = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'logout@test.com', password: 'password123' } })
      const { accessToken, refreshToken } = loginRes.json().data

      const logoutRes = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', payload: { refreshToken }, headers: { authorization: `Bearer ${accessToken}` } })
      expect(logoutRes.statusCode).toBe(204)

      // Try to use revoked refresh token
      const refreshRes = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken } })
      expect(refreshRes.statusCode).toBe(401)
    })
  })
})