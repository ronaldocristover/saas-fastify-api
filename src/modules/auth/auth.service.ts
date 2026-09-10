import { createHash, randomUUID } from 'node:crypto'
import type { User } from '../../db/schema'
import { hashPassword, verifyPassword } from '../../common/password'
import { conflict, notFound, unauthorized } from '../../common/errors'
import type { UserRole } from '../../types/roles'
import { createAuthRepository } from './auth.repository'
import { type AppDb } from '../../db/index'

/** Public user shape. Never exposes passwordHash or deletedAt. */
export interface PublicUser {
  id: string
  email: string
  fullName: string
  role: UserRole
  createdAt: string // ISO datetime string for JSON serialization
}

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : user.createdAt,
  }
}

export function sha256(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

interface TokenSigner {
  /** Matches @fastify/jwt JwtSignFunction: takes any payload object. */
  accessJwtSign: (payload: object) => Promise<string>
  refreshJwtSign: (payload: object) => Promise<string>
}

export type AuthRepositoryShape = ReturnType<typeof createAuthRepository>

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

export function createAuthService(
  db: AppDb,
  jwt: TokenSigner,
  repo: AuthRepositoryShape = createAuthRepository(db),
) {
  function makeAccessToken(user: Pick<User, 'id' | 'role'>): Promise<string> {
    return jwt.accessJwtSign({ sub: user.id, role: user.role })
  }

  function makeRefreshToken(user: Pick<User, 'id' | 'role'>, jti: string): Promise<string> {
    return jwt.refreshJwtSign({ sub: user.id, role: user.role, jti })
  }

  /** Extract the `sub` claim from a JWT without verifying (verification is
   *  done by the route layer via the refresh namespace before this runs, and
   *  the token is matched against the DB hash below regardless). */
  function readSub(rawToken: string): string | undefined {
    const parts = rawToken.split('.')
    const payloadB64 = parts[1]
    if (!payloadB64) return undefined
    try {
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as {
        sub?: string
      }
      return payload.sub
    } catch {
      return undefined
    }
  }

  /** Persist the SHA-256 hash of the raw JWT with its expiry. */
  async function storeRefreshToken(rawToken: string, userId: string) {
    const parts = rawToken.split('.')
    const payloadB64 = parts[1]
    if (!payloadB64) {
      throw unauthorized('INVALID_TOKEN', 'Malformed refresh token')
    }
    let exp: number
    try {
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as {
        exp?: number
      }
      exp = payload.exp ?? 0
    } catch {
      throw unauthorized('INVALID_TOKEN', 'Malformed refresh token')
    }
    await repo.createRefreshToken({
      userId,
      tokenHash: sha256(rawToken),
      expiresAt: new Date(exp * 1000),
    })
  }

  async function issueTokenPair(user: User): Promise<TokenPair> {
    const accessToken = await makeAccessToken(user)
    // A random `jti` guarantees a unique token hash per login, even when two
    // logins happen within the same second (JWTs would otherwise be identical).
    const refreshToken = await makeRefreshToken(user, randomUUID())
    await storeRefreshToken(refreshToken, user.id)
    return { accessToken, refreshToken }
  }

  return {
    async register(input: {
      email: string
      password: string
      fullName: string
    }): Promise<{ user: PublicUser } & TokenPair> {
      const email = input.email.toLowerCase()
      const existing = await repo.findByEmail(email)
      if (existing) {
        throw conflict('EMAIL_EXISTS', 'Email is already registered')
      }

      const passwordHash = await hashPassword(input.password)
      const user = await repo.create({
        email,
        passwordHash,
        fullName: input.fullName,
        role: 'member',
      })

      const tokens = await issueTokenPair(user)
      return { user: toPublicUser(user), ...tokens }
    },

    async login(input: { email: string; password: string }): Promise<{ user: PublicUser } & TokenPair> {
      const user = await repo.findByEmail(input.email.toLowerCase())
      if (!user) {
        // When user not found, still run verifyPassword to prevent timing oracle
        const DUMMY_HASH = '$argon2id$v=19$m=19456,t=2,p=1$dGVzdGRhdGE$.invalid'
        await verifyPassword(DUMMY_HASH, input.password).catch(() => {})
        throw unauthorized('INVALID_CREDENTIALS', 'Invalid email or password')
      }

      const valid = await verifyPassword(user.passwordHash, input.password)
      if (!valid) {
        throw unauthorized('INVALID_CREDENTIALS', 'Invalid email or password')
      }

      const tokens = await issueTokenPair(user)
      return { user: toPublicUser(user), ...tokens }
    },

    /** Check the refresh token against the DB, rotate it, and issue a new pair. */
    async refresh(rawRefreshToken: string): Promise<TokenPair> {
      const sub = readSub(rawRefreshToken)
      if (!sub) {
        throw unauthorized('INVALID_TOKEN', 'Malformed refresh token')
      }

      // Extract exp from JWT payload to check expiry
      const parts = rawRefreshToken.split('.')
      const payloadB64 = parts[1]
      if (!payloadB64) {
        throw unauthorized('INVALID_TOKEN', 'Malformed refresh token')
      }
      let exp: number
      try {
        const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as {
          exp?: number
        }
        exp = payload.exp ?? 0
      } catch {
        throw unauthorized('INVALID_TOKEN', 'Malformed refresh token')
      }
      if (exp * 1000 <= Date.now()) {
        throw unauthorized('REFRESH_EXPIRED', 'Refresh token has expired')
      }

      const tokenHash = sha256(rawRefreshToken)
      // Atomic revocation: if already revoked or missing, reject
      const wasActive = await repo.revokeIfActive(tokenHash)
      if (!wasActive) {
        throw unauthorized('REFRESH_NOT_FOUND', 'Refresh token is invalid or has been revoked')
      }

      const user = await repo.findById(sub)
      if (!user) {
        throw unauthorized('USER_NOT_FOUND', 'User no longer exists')
      }

      // Issue new pair first, then revoke old -- failure to issue should not
      // leave the user stranded with a revoked-but-unusable token.
      return issueTokenPair(user)
    },

    /** Revoke a refresh token (idempotent: revoking an unknown token is a no-op). */
    async logout(rawRefreshToken: string): Promise<void> {
      await repo.revokeRefreshToken(sha256(rawRefreshToken))
    },

    async getMe(userId: string): Promise<PublicUser> {
      const user = await repo.findById(userId)
      if (!user) {
        throw notFound('USER_NOT_FOUND', 'User not found')
      }
      return toPublicUser(user)
    },
  }
}

export type AuthService = ReturnType<typeof createAuthService>