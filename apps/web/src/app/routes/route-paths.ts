/**
 * Centralized Route Paths Constants for CourseFlix.
 * Easily extendable for future sprint modules (Lessons, Quizzes, AI Tutor, Settings, Analytics, Checkout).
 */
export const ROUTE_PATHS = {
  ROOT: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  FORBIDDEN: '/403',
  NOT_FOUND: '/404',

  STUDENT: {
    ROOT: '/student',
    DASHBOARD: '/student/dashboard',
    BROWSE: '/student/browse',
    COURSES: '/student/courses',
    COURSE_DETAIL: '/student/courses/:courseId',
    ASSISTANT: '/student/courses/:courseId/assistant',
    LESSON_DETAIL: '/student/lessons/:lessonId',
    QUIZ_DETAIL: '/student/quizzes/:quizId',
    NOTIFICATIONS: '/student/notifications',
    INTERVENTIONS: '/student/interventions',
    MINI_QUIZ: '/student/mini-quizzes/:miniQuizId',
    CHECKOUT: '/student/checkout/:courseId',
  },

  TEACHER: {
    ROOT: '/teacher',
    DASHBOARD: '/teacher/dashboard',
    COURSES: '/teacher/courses',
    STUDENTS: '/teacher/students',
    COURSE_CREATE: '/teacher/courses/new',
    COURSE_DETAIL: '/teacher/courses/:courseId',
    LESSON_DETAIL: '/teacher/lessons/:lessonId',
    NOTIFICATIONS: '/teacher/notifications',
    AGENT_LOGS: '/teacher/agent-logs',
    INTERVENTIONS: '/teacher/interventions',
    SALES: '/teacher/sales',
    ANALYTICS: '/teacher/analytics',
  },

  ADMIN: {
    ROOT: '/admin',
    DASHBOARD: '/admin/dashboard',
    USERS: '/admin/users',
    USER_DETAIL: '/admin/users/:userId',
    CREATE_ADMIN: '/admin/users/new',
    COURSES: '/admin/courses',
    COURSE_DETAIL: '/admin/courses/:courseId',
    ORDERS: '/admin/orders',
    ORDER_DETAIL: '/admin/orders/:orderId',
    QUIZZES: '/admin/quizzes',
    QUIZ_DETAIL: '/admin/quizzes/:quizId',
    DOCUMENTS: '/admin/documents',
    INTERVENTIONS: '/admin/interventions',
    NOTIFICATIONS: '/admin/notifications',
    NOTIFICATIONS_LOG: '/admin/notifications-log',
    AGENT_LOGS: '/admin/agent-logs',
  },
} as const

export type RoutePaths = typeof ROUTE_PATHS
