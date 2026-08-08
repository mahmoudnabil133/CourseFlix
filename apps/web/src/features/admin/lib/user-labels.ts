import type { UserRole } from '../../auth/types/auth.types'
import type { UserStatus } from '../types/admin.types'

// Kept local to the admin feature rather than in the shared status-labels
// map — role/status here describe a platform account, not course content,
// so they don't belong alongside course/enrollment/document status chips.
type ChipVariant = '' | 'green' | 'pink' | 'red' | 'outline'

export const USER_ROLE_LABEL: Record<UserRole, { label: string; chip: ChipVariant }> = {
  student: { label: 'طالب', chip: 'outline' },
  teacher: { label: 'معلم', chip: 'pink' },
  admin: { label: 'أدمن', chip: 'green' },
}

export const USER_STATUS_LABEL: Record<UserStatus, { label: string; chip: ChipVariant }> = {
  active: { label: 'نشط', chip: 'green' },
  suspended: { label: 'موقوف', chip: 'red' },
  inactive: { label: 'غير مفعل', chip: 'outline' },
}
