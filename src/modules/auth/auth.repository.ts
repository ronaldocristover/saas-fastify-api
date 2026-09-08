import { and, eq, isNull, sql } from 'drizzle-orm'
import { users, refreshTokens, type User } from '../../db/schema.js'
import { type AppDb } from '../../db/index.js'
import type { UserRole } from '../../types/roles.js'

export interface AuthRepository {
  findByEmail(email: string): Promise<User | undefined>
  findById(id: string): Promise<User | undefined>
  create(data: { email: string; passwordHash: string; fullName: string; role: UserRole }): Promise<User>
  createRefreshToken(data: { userId: string; tokenHash: string; expiresAt: Date }): Promise<void>
  findRefreshToken(tokenHash: string): Promise<typeof refreshTokens.$inferSelect | undefined>
  revokeRefreshToken(tokenHash: string): Promise<void>
  revokeIfActive(tokenHash: string): Promise<boolean>
}

export function createAuthRepository(db: AppDb): AuthRepository {
  return {
    async findByEmail(email) {
      const [user] = await db
        .select()
        .from(users)
        .where(and(eq(users.email, email), isNull(users.deletedAt)))
        .limit(1)
      return user
    },

    async findById(id) {
      const [user] = await db
        .select()
        .from(users)
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .limit(1)
      return user
    },

    async create(data) {
      const result = await db.insert(users).values(data).returning()
      const user = result[0]
      if (!user) throw new Error('Failed to create user')
      return user
    },

    async createRefreshToken(data) {
      await db.insert(refreshTokens).values(data)
    },

    async findRefreshToken(tokenHash) {
      const [row] = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, tokenHash))
        .limit(1)
      return row
    },

    async revokeRefreshToken(tokenHash) {
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokens.tokenHash, tokenHash))
    },

    async revokeIfActive(tokenHash) {
      const result = await db.execute(
        sql`UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = ${tokenHash} AND revoked_at IS NULL`
      )
      return (result.rowCount ?? 0) > 0
    },
  }
}