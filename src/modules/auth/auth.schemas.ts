import { z } from 'zod/v4'

// Shared public-user schema. Dates serialize to ISO strings in JSON; services
// hand these shapes already-converted (see toPublicUser in auth.service).
const publicUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  fullName: z.string(),
  role: z.enum(['member', 'admin']),
  createdAt: z.iso.datetime(),
})

const tokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
})

const authResultSchema = z.object({
  user: publicUserSchema,
  accessToken: z.string(),
  refreshToken: z.string(),
})

export const registerSchema = {
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8).max(128),
    fullName: z.string().min(1).max(255),
  }),
  response: {
    201: z.object({ data: authResultSchema }),
  },
}

export const loginSchema = {
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1).max(128),
  }),
  response: {
    200: z.object({ data: authResultSchema }),
  },
}

export const refreshSchema = {
  body: z.object({
    refreshToken: z.string().min(1),
  }),
  response: {
    200: z.object({ data: tokenPairSchema }),
  },
}

export const logoutSchema = {
  body: z.object({
    refreshToken: z.string().min(1),
  }),
  response: {
    204: z.void(),
  },
}

export const meSchema = {
  response: {
    200: z.object({ data: publicUserSchema }),
  },
}
