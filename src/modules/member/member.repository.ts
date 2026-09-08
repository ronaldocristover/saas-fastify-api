import { and, asc, count, eq, ilike, isNull, or } from 'drizzle-orm'
import { users } from '../../db/schema.js'
import { type AppDb } from '../../db/index.js'
import { notFound } from '../../common/errors.js'
import { buildMeta, type Page, type PageMeta } from '../../common/pagination.js'
import type { UserRole } from '../../types/roles.js'

/** Public shape of a member. Never exposes passwordHash or deletedAt. */
export interface PublicMember {
  id: string
  email: string
  fullName: string
  role: UserRole
  createdAt: string // ISO datetime string for JSON serialization
  updatedAt: string
}

export interface MemberRepository {
  list(params: {
    page: Page
    search?: string
    role?: UserRole
  }): Promise<{ data: PublicMember[]; meta: PageMeta }>
  findById(id: string): Promise<PublicMember>
  update(id: string, data: { fullName?: string; role?: UserRole }): Promise<PublicMember>
  softDelete(id: string): Promise<void>
}

function toPublicMember(user: {
  id: string
  email: string
  fullName: string
  role: UserRole
  createdAt: Date
  updatedAt: Date
}): PublicMember {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : user.createdAt,
    updatedAt: user.updatedAt instanceof Date ? user.updatedAt.toISOString() : user.updatedAt,
  }
}

export function createMemberRepository(db: AppDb): MemberRepository {
  return {
    async list({ page, search, role }): Promise<{ data: PublicMember[]; meta: PageMeta }> {
      const conditions = [isNull(users.deletedAt)]
      if (search) {
        // Match on name or email so admins can find members either way.
        conditions.push(
          or(ilike(users.fullName, `%${search}%`), ilike(users.email, `%${search}%`))!,
        )
      }
      if (role) {
        conditions.push(eq(users.role, role))
      }
      const where = and(...conditions)

      const rows = await db
        .select({
          id: users.id,
          email: users.email,
          fullName: users.fullName,
          role: users.role,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        })
        .from(users)
        .where(where)
        .orderBy(asc(users.createdAt))
        .limit(page.limit)
        .offset(page.offset)

      const totals = await db
        .select({ total: count() })
        .from(users)
        .where(where)
      const total = totals[0]?.total ?? 0

      return { data: rows.map(toPublicMember), meta: buildMeta(page, total) }
    },

    async findById(id) {
      const [user] = await db
        .select()
        .from(users)
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .limit(1)
      if (!user) throw notFound('MEMBER_NOT_FOUND', 'Member not found')
      return toPublicMember(user)
    },

    async update(id, data) {
      const [user] = await db
        .update(users)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .returning()
      if (!user) throw notFound('MEMBER_NOT_FOUND', 'Member not found')
      return toPublicMember(user)
    },

    /** Soft delete: sets deleted_at; the row stays for audit purposes. */
    async softDelete(id) {
      const [updated] = await db
        .update(users)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .returning({ id: users.id })
      if (!updated) throw notFound('MEMBER_NOT_FOUND', 'Member not found')
    },
  }
}