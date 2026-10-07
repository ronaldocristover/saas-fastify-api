import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import multipart, { type SavedMultipartFile } from '@fastify/multipart'
import { stat } from 'node:fs/promises'
import { createFileService, MAX_FILE_SIZE, fileTooLarge } from './file.service'
import { badRequest } from '../../common/errors'
import {
  uploadFileSchema,
  getFileDownloadUrlSchema,
  listFilesSchema,
} from './file.schemas'

export default async function fileRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  await fastify.register(multipart, {
    limits: {
      fileSize: MAX_FILE_SIZE,
      files: 1,
      fields: 0,
    },
  })

  const service = createFileService(fastify.db, {
    s3: fastify.s3,
    s3Bucket: fastify.s3Bucket,
    s3PresignedExpiry: fastify.s3PresignedExpiry,
  })

  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/upload',
    schema: uploadFileSchema,
    onRequest: [fastify.authenticate],
    handler: async (request, reply) => {
      let files: SavedMultipartFile[]
      try {
        files = (await request.saveRequestFiles()).files
      } catch (err) {
        if (err instanceof fastify.multipartErrors.RequestFileTooLargeError) {
          throw fileTooLarge()
        }
        throw err
      }

      const file = files[0]
      if (!file) {
        throw badRequest('FILE_REQUIRED', 'A file is required in the "file" field')
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
