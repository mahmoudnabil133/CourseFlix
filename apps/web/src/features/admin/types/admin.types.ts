import type { UserRole } from '../../auth/types/auth.types'
import type { CourseStatus } from '../../courses/types/course.types'
import type { DocumentProcessingStatus } from '../../documents/types/document.types'

export type UserStatus = 'active' | 'suspended' | 'inactive'

export interface AdminUserListItem {
  id: string
  fullName: string
  email: string
  role: UserRole
  status: UserStatus
  lastLoginAt: string | null
  createdAt: string
}

export interface AdminUserDetail extends AdminUserListItem {
  avatarUrl: string | null
  updatedAt: string
  dependentRecordCounts: {
    coursesTaught: number
    enrollments: number
    orders: number
  }
}

export interface AdminUsersFilter {
  role?: UserRole
  status?: UserStatus
  search?: string
}

export interface UpdateAdminUserPayload {
  fullName?: string
  avatarUrl?: string | null
}

export interface CreateAdminAccountPayload {
  fullName: string
  email: string
  password: string
}

export interface AdminCourseListItem {
  id: string
  title: string
  slug: string
  gradeLevel: string | null
  status: CourseStatus
  teacherId: string
  teacherName: string
  createdAt: string
}

export interface AdminCoursesFilter {
  status?: CourseStatus
  teacherId?: string
  search?: string
}

export interface UpdateAdminCoursePayload {
  title?: string
  description?: string | null
  coverImageUrl?: string | null
  gradeLevel?: string | null
  status?: 'draft' | 'published'
}

export type OrderStatus = 'pending' | 'paid' | 'failed'

export interface AdminOrderListItem {
  id: string
  studentId: string
  studentName: string
  status: OrderStatus
  paymentStatus: OrderStatus
  currency: string
  totalMinor: number
  createdAt: string
  paidAt: string | null
}

export interface AdminOrderDetail extends AdminOrderListItem {
  items: Array<{ courseId: string; title: string; priceMinor: number }>
  payments: Array<{
    id: string
    attemptNo: number
    status: OrderStatus
    method: string
    externalRef: string | null
    createdAt: string
  }>
}

export interface AdminOrdersFilter {
  status?: OrderStatus
  studentId?: string
}

export interface AdminQuizListItem {
  id: string
  title: string
  courseId: string
  courseTitle: string
  createdAt: string
}

export interface AdminQuizzesFilter {
  courseId?: string
}

export interface AdminQuizDetail {
  id: string
  title: string
  version: number
  questions: Array<{
    id: string
    type: string
    text: string
    options: string[] | null
    correctAnswer: string
  }>
  courseId: string
  courseTitle: string
  teacherId: string
  teacherName: string
}

export interface UpdateAdminQuizPayload {
  title?: string
}

export interface AdminDocumentListItem {
  id: string
  fileName: string
  courseId: string
  courseTitle: string
  processingStatus: DocumentProcessingStatus
  version: number
  createdAt: string
  errorMessage: string | null
}

export interface AdminDocumentsFilter {
  courseId?: string
}

export type InterventionStatus = 'active' | 'resolved'

export interface AdminInterventionListItem {
  id: string
  studentId: string
  studentName: string
  teacherId: string
  teacherName: string
  courseId: string
  ruleKey: string
  weakConcept: string
  status: InterventionStatus
  createdAt: string
  resolvedAt: string | null
}

export interface AdminInterventionsFilter {
  status?: InterventionStatus
  studentId?: string
  teacherId?: string
}

export interface AdminNotificationListItem {
  id: string
  userId: string
  userName: string
  type: string
  title: string
  message: string
  isRead: boolean
  createdAt: string
}

export interface AdminNotificationsFilter {
  userId?: string
}

export interface AdminAgentLogListItem {
  id: string
  agentType: string
  courseId: string | null
  action: string
  status: 'success' | 'failed' | 'retrying' | 'skipped'
  tokensUsed: number | null
  durationMs: number | null
  correlationId: string | null
  errorMessage: string | null
  executedAt: string
}

export interface AdminAnalyticsOverview {
  users: {
    total: number
    students: number
    teachers: number
    admins: number
  }
  courses: {
    total: number
    published: number
    draft: number
  }
  commerce: {
    totalOrders: number
    paidOrders: number
    revenueMinor: number
    currency: string
  }
  interventions: {
    active: number
  }
}

export interface AdminAgentLogsFilter {
  agentType?: string
  status?: string
  courseId?: string
}
