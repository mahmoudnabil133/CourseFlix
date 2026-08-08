import { ROUTE_PATHS } from '../../../app/routes/route-paths'
import type { UserRole } from '../types/auth.types'

const ROLE_HOME_PATHS: Record<UserRole, string> = {
  student: ROUTE_PATHS.STUDENT.DASHBOARD,
  teacher: ROUTE_PATHS.TEACHER.DASHBOARD,
  admin: ROUTE_PATHS.ADMIN.DASHBOARD,
}

export function getRoleHomePath(role: UserRole): string {
  return ROLE_HOME_PATHS[role]
}
