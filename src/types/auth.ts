import type { UserRole } from './roles'

export interface AuthenticatedUser {
  id: string
  role: UserRole
}
