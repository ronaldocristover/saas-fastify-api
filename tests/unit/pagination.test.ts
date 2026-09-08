import { describe, it, expect } from 'bun:test'
import { parsePagination, buildMeta } from '../../src/common/pagination.js'

describe('parsePagination', () => {
  it('clamps page to >= 1', () => {
    expect(parsePagination(0, 20)).toEqual({ page: 1, limit: 20, offset: 0 })
    expect(parsePagination(-5, 20)).toEqual({ page: 1, limit: 20, offset: 0 })
  })

  it('clamps limit between 1 and 100', () => {
    expect(parsePagination(1, 0)).toEqual({ page: 1, limit: 1, offset: 0 })
    expect(parsePagination(1, 999)).toEqual({ page: 1, limit: 100, offset: 0 })
  })

  it('calculates offset correctly', () => {
    expect(parsePagination(3, 10)).toEqual({ page: 3, limit: 10, offset: 20 })
  })

  it('handles null/undefined defaults', () => {
    expect(parsePagination(null, null)).toEqual({ page: 1, limit: 20, offset: 0 })
  })
})

describe('buildMeta', () => {
  it('calculates totalPages', () => {
    expect(buildMeta({ page: 1, limit: 20, offset: 0 }, 45)).toEqual({ page: 1, limit: 20, total: 45, totalPages: 3 })
    expect(buildMeta({ page: 1, limit: 20, offset: 0 }, 0)).toEqual({ page: 1, limit: 20, total: 0, totalPages: 0 })
    expect(buildMeta({ page: 2, limit: 10, offset: 10 }, 20)).toEqual({ page: 2, limit: 10, total: 20, totalPages: 2 })
  })
})
