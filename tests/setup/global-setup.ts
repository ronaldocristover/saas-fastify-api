import type { TestProject } from 'vitest/node'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { execSync } from 'node:child_process'

let container: StartedPostgreSqlContainer | undefined

export default async function setup(project: TestProject) {
  // Start a real PostgreSQL container for integration tests.
  container = await new PostgreSqlContainer('postgres:17-alpine')
    .withDatabase('test_db')
    .withUsername('test')
    .withPassword('test')
    .start()

  const url = container.getConnectionUri()
  project.provide('DATABASE_URL', url)
  // The app reads config from process.env; point it at the testcontainers DB
  // for the duration of the run so buildApp() uses the fresh database.
  process.env.DATABASE_URL = url

  // Run drizzle-kit migrate against the fresh database via DATABASE_URL env.
  execSync('npx drizzle-kit migrate', {
    cwd: process.cwd(),
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: url },
  })
}

declare module 'vitest' {
  interface ProvidedContext {
    DATABASE_URL: string
  }
}