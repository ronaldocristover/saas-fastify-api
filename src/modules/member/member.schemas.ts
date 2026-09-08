import { z } from 'zod/v4'

const publicMemberSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  fullName: z.string(),
  role: z.enum(['member', 'admin']),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

const pageMetaSchema = z.object({
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  totalPages: z.number(),
})

export const listMembersSchema = {
  querystring: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().min(1).max(255).optional(),
    role: z.enum(['member', 'admin']).optional(),
  }),
  response: {
    200: z.object({
      data: z.array(publicMemberSchema),
      meta: pageMetaSchema,
    }),
  },
}

export const getMemberSchema = {
  params: z.object({
    id: z.string().uuid(),
  }),
  response: {
    200: z.object({ data: publicMemberSchema }),
  },
}

export const updateMemberSchema = {
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z
    .object({
      fullName: z.string().min(1).max(255).optional(),
      role: z.enum(['member', 'admin']).optional(),
    })
    .refine((data) => data.fullName !== undefined || data.role !== undefined, {
      message: 'At least one of fullName or role must be provided',
    }),
  response: {
    200: z.object({ data: publicMemberSchema }),
  },
}

export const deleteMemberSchema = {
  params: z.object({
    id: z.string().uuid(),
  }),
  response: {
    204: z.void(),
  },
}
