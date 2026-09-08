import './config/env.js' // Loads env vars at the top-level first.
import { buildApp } from './app.js'
import { config } from './config/env.js'
import { cleanupRefreshTokens } from './db/cleanup.js'
async function main() {
  const app = await buildApp()

  // Graceful shutdown on SIGTERM / SIGINT.
  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down gracefully...`)
    const forceExit = setTimeout(() => {
      app.log.error('Shutdown timed out after 10s, forcing exit')
      process.exit(1)
    }, 10_000)
    forceExit.unref()
    try {
      await app.close()
      clearTimeout(forceExit)
      process.exit(0)
    } catch (err) {
      app.log.error({ err }, 'Error during shutdown')
      clearTimeout(forceExit)
      process.exit(1)
    }
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))

  await app.listen({ port: config.PORT, host: '0.0.0.0' })

  // Non-blocking cleanup on startup
  cleanupRefreshTokens()
    .then(n => { if (n > 0) app.log.info({ deleted: n }, 'Refresh token cleanup done') })
    .catch(() => {})
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason)
})

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err)
  process.exit(1)
})

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server', err)
  process.exit(1)
})
