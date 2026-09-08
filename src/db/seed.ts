import { sql } from 'drizzle-orm'
import { getDb, getPool } from './index.js'
import { hashPassword } from '../common/password.js'

// Seed script: creates an admin user and sample members.
// Safe to run multiple times (idempotent via UPSERT on email).
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@example.com'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin123456'

const members = [
  { email: 'member1@example.com', fullName: 'Alice Johnson' },
  { email: 'member2@example.com', fullName: 'Bob Smith' },
  { email: 'member3@example.com', fullName: 'Carol Lee' },
  { email: 'member4@example.com', fullName: 'Dave Wilson' },
  { email: 'member5@example.com', fullName: 'Eve Garcia' },
]

async function seed() {
  const db = getDb()

  // Upsert admin.
  const adminHash = await hashPassword(ADMIN_PASSWORD)
  await db.execute(sql`
    INSERT INTO users (email, password_hash, full_name, role)
    VALUES (${ADMIN_EMAIL}, ${adminHash}, 'Admin', 'admin')
    ON CONFLICT (email) DO UPDATE SET password_hash = ${adminHash}, full_name = 'Admin', role = 'admin'
  `)

  // Upsert sample members.
  for (const m of members) {
    const hash = await hashPassword('password123')
    await db.execute(sql`
      INSERT INTO users (email, password_hash, full_name, role)
      VALUES (${m.email}, ${hash}, ${m.fullName}, 'member')
      ON CONFLICT (email) DO UPDATE SET full_name = ${m.fullName}, password_hash = ${hash}
    `)
  }

  // eslint-disable-next-line no-console
  console.log('Database seeded successfully.')
  await getPool().end()
}

seed().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Seed failed:', err)
  process.exit(1)
})