import type { UserRole } from './roles.js'

export interface AuthenticatedUser {
  id: string
  role: UserRole
}
