// Pagination helpers shared by list endpoints. KISS: page/limit query params
// with sane defaults, total count + totalPages derived from a COUNT(*) query.
export const DEFAULT_PAGE = 1
export const DEFAULT_LIMIT = 20
export const MAX_LIMIT = 100

export interface Page {
  page: number
  limit: number
  offset: number
}

export function parsePagination(
  page?: number | null,
  limit?: number | null,
): Page {
  const safePage = Math.max(1, Math.floor(page ?? DEFAULT_PAGE))
  const safeLimit = Math.min(
    MAX_LIMIT,
    Math.max(1, Math.floor(limit ?? DEFAULT_LIMIT)),
  )
  return { page: safePage, limit: safeLimit, offset: (safePage - 1) * safeLimit }
}

export interface PageMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

export function buildMeta(page: Page, total: number): PageMeta {
  return {
    page: page.page,
    limit: page.limit,
    total,
    totalPages: Math.ceil(total / page.limit),
  }
}