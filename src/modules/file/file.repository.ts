import { asc, count, eq } from 'drizzle-orm'
import { files, type FileRecord } from '../../db/schema.js'
import { type AppDb } from '../../db/index.js'
import { buildMeta, type Page, type PageMeta } from '../../common/pagination.js'

export interface PublicFileRecord {
  id: string
  userId: string
  originalName: string
  mimeType: string
  size: number
  createdAt: string
}

export interface FileRepository {
  create(data: {
    userId: string
    originalName: string
    mimeType: string
    size: number
    s3Key: string
  }): Promise<PublicFileRecord>

  findById(id: string): Promise<(PublicFileRecord & { s3Key: string }) | undefined>

  list(params: {
    page: Page
    userId?: string
  }): Promise<{ data: PublicFileRecord[]; meta: PageMeta }>

  deleteById(id: string): Promise<void>
}

function toPublicFile(record: FileRecord): PublicFileRecord {
  return {
    id: record.id,
    userId: record.userId,
    originalName: record.originalName,
    mimeType: record.mimeType,
    size: record.size,
    createdAt:
      record.createdAt instanceof Date
        ? record.createdAt.toISOString()
        : record.createdAt,
  }
}

export function createFileRepository(db: AppDb): FileRepository {
  return {
    async create(data) {
      const [result] = await db.insert(files).values(data).returning()
      if (!result) throw new Error('Failed to create file record')
      return toPublicFile(result)
    },

    async findById(id) {
      const [row] = await db
        .select()
        .from(files)
        .where(eq(files.id, id))
        .limit(1)
      if (!row) return undefined
      const publicFile = toPublicFile(row)
      return { ...publicFile, s3Key: row.s3Key }
    },

    async list({ page, userId }) {
      const where = userId ? eq(files.userId, userId) : undefined

      const rows = await db
        .select()
        .from(files)
        .where(where)
        .orderBy(asc(files.createdAt))
        .limit(page.limit)
        .offset(page.offset)

      const totals = await db
        .select({ total: count() })
        .from(files)
        .where(where)
      const total = totals[0]?.total ?? 0

      return { data: rows.map(toPublicFile), meta: buildMeta(page, total) }
    },

    async deleteById(id) {
      await db.delete(files).where(eq(files.id, id))
    },
  }
}
