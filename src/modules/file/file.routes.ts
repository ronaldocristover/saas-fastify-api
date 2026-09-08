import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import multipart from '@fastify/multipart'
import { stat } from 'node:fs/promises'
import { createFileService } from './file.service.js'
import {
  uploadFileSchema,
  getFileDownloadUrlSchema,
  listFilesSchema,
} from './file.schemas.js'

export default async function fileRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  // Register multipart locally so only this route group handles file uploads
  await fastify.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
      files: 1,
      fields: 0,
    },
  })

  const service = createFileService(fastify.db, {
    s3: fastify.s3,
    s3Bucket: fastify.s3Bucket,
    s3PresignedExpiry: fastify.s3PresignedExpiry,
  })

  // POST /upload
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/upload',
    schema: uploadFileSchema,
    onRequest: [fastify.authenticate],
    handler: async (request, reply) => {
      const data = await request.saveRequestFiles()
      const file = data.files[0]
      if (!file) {
        throw new Error('No file provided')
      }

      const result = await service.upload(request.user.id, {
        filepath: file.filepath,
        filename: file.filename,
        mimetype: file.mimetype,
        size: (await stat(file.filepath)).size,
      })

      return reply.code(201).send({ data: result })
    },
  })

  // GET /:id/download-url
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: 'GET',
    url: '/:id/download-url',
    schema: getFileDownloadUrlSchema,
    onRequest: [fastify.authenticate],
    handler: async (request) => {
      const result = await service.getDownloadUrl(
        request.user,
        request.params.id,
      )
      return { data: result }
    },
  })

  // GET / (list user's files, or all files for admin)
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: 'GET',
    url: '/',
    schema: listFilesSchema,
    onRequest: [fastify.authenticate],
    handler: async (request) => {
      return service.list(request.user, request.query)
    },
  })
}
