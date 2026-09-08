import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { S3Client } from '@aws-sdk/client-s3'
import { config } from '../config/env.js'

declare module 'fastify' {
  interface FastifyInstance {
    s3: S3Client
    s3Bucket: string
    s3PresignedExpiry: number
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    const clientConfig: ConstructorParameters<typeof S3Client>[0] = {
      region: config.S3_REGION,
      credentials: {
        accessKeyId: config.S3_ACCESS_KEY_ID,
        secretAccessKey: config.S3_SECRET_ACCESS_KEY,
      },
    }

    // When S3_ENDPOINT is set (MinIO, LocalStack, etc.), override the
    // endpoint and force path-style addressing (required by MinIO).
    if (config.S3_ENDPOINT) {
      clientConfig.endpoint = config.S3_ENDPOINT
      clientConfig.forcePathStyle = true
    }

    const client = new S3Client(clientConfig)

    fastify.decorate('s3', client)
    fastify.decorate('s3Bucket', config.S3_BUCKET)
    fastify.decorate('s3PresignedExpiry', config.PRESIGNED_URL_EXPIRY)
  },
  { name: 's3' },
)
