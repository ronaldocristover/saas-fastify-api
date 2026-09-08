import { z } from 'zod/v4'

const fileRecordSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  originalName: z.string(),
  mimeType: z.string(),
  size: z.number().int(),
  createdAt: z.iso.datetime(),
})

const pageMetaSchema = z.object({
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  totalPages: z.number(),
})

export const uploadFileSchema = {
  // No body schema — multipart is parsed by @fastify/multipart, not Zod.
  response: {
    201: z.object({ data: fileRecordSchema }),
  },
}

export const getFileDownloadUrlSchema = {
  params: z.object({
    id: z.string().uuid(),
  }),
  response: {
    200: z.object({
      data: z.object({
        url: z.string().url(),
        expiresIn: z.number().int(),
      }),
    }),
  },
}

export const listFilesSchema = {
  querystring: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
  response: {
    200: z.object({
      data: z.array(fileRecordSchema),
      meta: pageMetaSchema,
    }),
  },
}
