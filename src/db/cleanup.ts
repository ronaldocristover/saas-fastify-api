import { sql } from 'drizzle-orm'
import { getDb } from './index'

/**
 * Remove expired and long-revoked refresh tokens.
 * Run periodically via cron or a scheduled job.
 * Retains revoked tokens for 30 days (audit trail).
 */
export async function cleanupRefreshTokens(): Promise<number> {
  const db = getDb()
  const result = await db.execute(sql`
    DELETE FROM refresh_tokens
    WHERE expires_at < now()
       OR (revoked_at IS NOT NULL AND revoked_at < now() - interval '30 days')
  `)
  return result.rowCount ?? 0
}
