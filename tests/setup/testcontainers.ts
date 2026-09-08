import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { execSync } from 'node:child_process'

let container: StartedPostgreSqlContainer | undefined
let startPromise: Promise<string> | undefined

async function doStart(): Promise<string> {
  container = await new PostgreSqlContainer('postgres:17-alpine')
    .withDatabase('test_db')
    .withUsername('test')
    .withPassword('test')
    .start()

  const url = container.getConnectionUri()
  process.env.DATABASE_URL = url

  // Run drizzle-kit migrate against the fresh database
  execSync('bunx drizzle-kit migrate', {
    cwd: process.cwd(),
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: url },
  })

  return url
}

export async function startTestcontainer(): Promise<string> {
  if (container) return process.env.DATABASE_URL!
  if (!startPromise) startPromise = doStart()
  return startPromise
}

export async function stopTestcontainer() {
  if (container) {
    await container.stop()
    container = undefined
    startPromise = undefined
  }
}
