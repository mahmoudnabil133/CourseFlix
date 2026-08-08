import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate, useRouteError } from 'react-router'
import { ROUTE_PATHS } from './route-paths'
import { RequireRole } from './RequireRole'
import { AuthLayout } from '../layouts/AuthLayout'
import { StudentLayout } from '../layouts/StudentLayout'
import { TeacherLayout } from '../layouts/TeacherLayout'
import { AdminLayout } from '../layouts/AdminLayout'
import { LoadingState } from '../../shared/components/LoadingState'
import { ErrorState } from '../../shared/components/ErrorState'

// Lazy-loaded page components
const LoginPage = lazy(() =>
  import('../../features/auth/pages/LoginPage').then((m) => ({ default: m.LoginPage }))
)
const RegisterPage = lazy(() =>
  import('../../features/auth/pages/RegisterPage').then((m) => ({ default: m.RegisterPage }))
)
const StudentDashboardPage = lazy(() =>
  import('../../features/student/pages/StudentDashboardPage').then((m) => ({ default: m.StudentDashboardPage }))
)
const StudentBrowseCoursesPage = lazy(() =>
  import('../../features/student/pages/StudentBrowseCoursesPage').then((m) => ({ default: m.StudentBrowseCoursesPage }))
)
const StudentCoursesPage = lazy(() =>
  import('../../features/student/pages/StudentCoursesPage').then((m) => ({ default: m.StudentCoursesPage }))
)
const StudentCourseDetailPage = lazy(() =>
  import('../../features/student/pages/StudentCourseDetailPage').then((m) => ({ default: m.StudentCourseDetailPage }))
)
const StudentLessonPage = lazy(() =>
  import('../../features/lessons/pages/StudentLessonPage').then((m) => ({ default: m.StudentLessonPage }))
)
const StudentQuizPage = lazy(() =>
  import('../../features/quizzes/pages/StudentQuizPage').then((m) => ({ default: m.StudentQuizPage }))
)
const StudentAssistantPage = lazy(() =>
  import('../../features/tutor/pages/StudentAssistantPage').then((m) => ({ default: m.StudentAssistantPage }))
)
const TeacherDashboardPage = lazy(() =>
  import('../../features/teacher/pages/TeacherDashboardPage').then((m) => ({ default: m.TeacherDashboardPage }))
)
const TeacherCoursesPage = lazy(() =>
  import('../../features/teacher/pages/TeacherCoursesPage').then((m) => ({ default: m.TeacherCoursesPage }))
)
const TeacherStudentsPage = lazy(() =>
  import('../../features/teacher/pages/TeacherStudentsPage').then((m) => ({ default: m.TeacherStudentsPage }))
)
const TeacherCourseCreatePage = lazy(() =>
  import('../../features/teacher/pages/TeacherCourseCreatePage').then((m) => ({ default: m.TeacherCourseCreatePage }))
)
const TeacherCourseDetailPage = lazy(() =>
  import('../../features/teacher/pages/TeacherCourseDetailPage').then((m) => ({ default: m.TeacherCourseDetailPage }))
)
const NotificationsPage = lazy(() =>
  import('../../features/notifications/pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage }))
)
const AgentLogsPage = lazy(() =>
  import('../../features/agent-logs/pages/AgentLogsPage').then((m) => ({ default: m.AgentLogsPage }))
)
const StudentInterventionsPage = lazy(() =>
  import('../../features/interventions/pages/StudentInterventionsPage').then((m) => ({
    default: m.StudentInterventionsPage,
  }))
)
const TeacherInterventionsPage = lazy(() =>
  import('../../features/interventions/pages/TeacherInterventionsPage').then((m) => ({
    default: m.TeacherInterventionsPage,
  }))
)
const StudentMiniQuizPage = lazy(() =>
  import('../../features/interventions/pages/StudentMiniQuizPage').then((m) => ({
    default: m.StudentMiniQuizPage,
  }))
)
const TeacherSalesPage = lazy(() =>
  import('../../features/sales/pages/TeacherSalesPage').then((m) => ({
    default: m.TeacherSalesPage,
  }))
)
const TeacherAnalyticsPage = lazy(() =>
  import('../../features/analytics/pages/TeacherAnalyticsPage').then((m) => ({
    default: m.TeacherAnalyticsPage,
  }))
)
const CheckoutPage = lazy(() =>
  import('../../features/checkout/pages/CheckoutPage').then((m) => ({
    default: m.CheckoutPage,
  }))
)
const AdminDashboardPage = lazy(() =>
  import('../../features/admin/pages/AdminDashboardPage').then((m) => ({
    default: m.AdminDashboardPage,
  }))
)
const AdminUsersPage = lazy(() =>
  import('../../features/admin/pages/AdminUsersPage').then((m) => ({ default: m.AdminUsersPage }))
)
const AdminUserDetailPage = lazy(() =>
  import('../../features/admin/pages/AdminUserDetailPage').then((m) => ({
    default: m.AdminUserDetailPage,
  }))
)
const AdminCreateAdminPage = lazy(() =>
  import('../../features/admin/pages/AdminCreateAdminPage').then((m) => ({
    default: m.AdminCreateAdminPage,
  }))
)
const AdminCoursesPage = lazy(() =>
  import('../../features/admin/pages/AdminCoursesPage').then((m) => ({ default: m.AdminCoursesPage }))
)
const AdminCourseDetailPage = lazy(() =>
  import('../../features/admin/pages/AdminCourseDetailPage').then((m) => ({
    default: m.AdminCourseDetailPage,
  }))
)
const AdminOrdersPage = lazy(() =>
  import('../../features/admin/pages/AdminOrdersPage').then((m) => ({ default: m.AdminOrdersPage }))
)
const AdminOrderDetailPage = lazy(() =>
  import('../../features/admin/pages/AdminOrderDetailPage').then((m) => ({
    default: m.AdminOrderDetailPage,
  }))
)
const AdminQuizzesPage = lazy(() =>
  import('../../features/admin/pages/AdminQuizzesPage').then((m) => ({ default: m.AdminQuizzesPage }))
)
const AdminQuizDetailPage = lazy(() =>
  import('../../features/admin/pages/AdminQuizDetailPage').then((m) => ({
    default: m.AdminQuizDetailPage,
  }))
)
const AdminDocumentsPage = lazy(() =>
  import('../../features/admin/pages/AdminDocumentsPage').then((m) => ({
    default: m.AdminDocumentsPage,
  }))
)
const AdminInterventionsPage = lazy(() =>
  import('../../features/admin/pages/AdminInterventionsPage').then((m) => ({
    default: m.AdminInterventionsPage,
  }))
)
const AdminNotificationsLogPage = lazy(() =>
  import('../../features/admin/pages/AdminNotificationsLogPage').then((m) => ({
    default: m.AdminNotificationsLogPage,
  }))
)
const AdminAgentLogsPage = lazy(() =>
  import('../../features/admin/pages/AdminAgentLogsPage').then((m) => ({
    default: m.AdminAgentLogsPage,
  }))
)

// Lazy-loaded status pages
const ForbiddenStatePage = lazy(() =>
  import('../../shared/components/ForbiddenState').then((m) => ({ default: m.ForbiddenState }))
)
const NotFoundStatePage = lazy(() =>
  import('../../shared/components/NotFoundState').then((m) => ({ default: m.NotFoundState }))
)

// Route-level Error Boundary component
export function RouteErrorBoundary() {
  const error = useRouteError()
  console.error('Route error caught by ErrorBoundary:', error)
  return (
    <div className="flex min-h-screen w-full items-center justify-center">
      <ErrorState />
    </div>
  )
}

// Suspense helper for lazy-loaded route elements
function SuspenseWrapper({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<LoadingState />}>{children}</Suspense>
}

/**
 * Data Router configuration for CourseFlix Sprint 1 MVP.
 * Supports nested layout routes, lazy page loading, ErrorBoundary, and centralized path constants.
 */
// eslint-disable-next-line react-refresh/only-export-components -- router config is not a component; co-locating it here keeps route wiring in one place.
export const router = createBrowserRouter([
  {
    path: ROUTE_PATHS.ROOT,
    element: <Navigate to={ROUTE_PATHS.LOGIN} replace />,
  },

  /* Auth Routes */
  {
    element: <AuthLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        path: ROUTE_PATHS.LOGIN,
        element: (
          <SuspenseWrapper>
            <LoginPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: ROUTE_PATHS.REGISTER,
        element: (
          <SuspenseWrapper>
            <RegisterPage />
          </SuspenseWrapper>
        ),
      },
    ],
  },

  /* Student Routes — gated behind RequireRole("student"): unauthenticated
     users are sent to /login, wrong-role users to /403. */
  {
    element: <RequireRole role="student" />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        path: ROUTE_PATHS.STUDENT.ROOT,
        element: <StudentLayout />,
        children: [
          {
            path: ROUTE_PATHS.STUDENT.DASHBOARD,
            element: (
              <SuspenseWrapper>
                <StudentDashboardPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTE_PATHS.STUDENT.BROWSE,
            element: (
              <SuspenseWrapper>
                <StudentBrowseCoursesPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTE_PATHS.STUDENT.COURSES,
            element: (
              <SuspenseWrapper>
                <StudentCoursesPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTE_PATHS.STUDENT.COURSE_DETAIL,
            element: (
              <SuspenseWrapper>
                <StudentCourseDetailPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTE_PATHS.STUDENT.LESSON_DETAIL,
            element: (
              <SuspenseWrapper>
                <StudentLessonPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTE_PATHS.STUDENT.QUIZ_DETAIL,
            element: (
              <SuspenseWrapper>
                <StudentQuizPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTE_PATHS.STUDENT.ASSISTANT,
            element: (
              <SuspenseWrapper>
                <StudentAssistantPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTE_PATHS.STUDENT.NOTIFICATIONS,
            element: (
              <SuspenseWrapper>
                <NotificationsPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTE_PATHS.STUDENT.INTERVENTIONS,
            element: (
              <SuspenseWrapper>
                <StudentInterventionsPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTE_PATHS.STUDENT.MINI_QUIZ,
            element: (
              <SuspenseWrapper>
                <StudentMiniQuizPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTE_PATHS.STUDENT.CHECKOUT,
            element: (
              <SuspenseWrapper>
                <CheckoutPage />
              </SuspenseWrapper>
            ),
          },
        ],
      },
    ],
  },

  /* Teacher Routes — gated behind RequireRole("teacher"). */
  {
    element: <RequireRole role="teacher" />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        path: ROUTE_PATHS.TEACHER.ROOT,
        element: <TeacherLayout />,
        children: [
          {
            path: ROUTE_PATHS.TEACHER.DASHBOARD,
            element: (
              <SuspenseWrapper>
                <TeacherDashboardPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTE_PATHS.TEACHER.COURSES,
            element: (
              <SuspenseWrapper>
                <TeacherCoursesPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTE_PATHS.TEACHER.STUDENTS,
            element: (
              <SuspenseWrapper>
                <TeacherStudentsPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTE_PATHS.TEACHER.COURSE_CREATE,
            element: (
              <SuspenseWrapper>
                <TeacherCourseCreatePage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTE_PATHS.TEACHER.COURSE_DETAIL,
            element: (
              <SuspenseWrapper>
                <TeacherCourseDetailPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTE_PATHS.TEACHER.LESSON_DETAIL,
            element: (
              <SuspenseWrapper>
                <StudentLessonPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTE_PATHS.TEACHER.NOTIFICATIONS,
            element: (
              <SuspenseWrapper>
                <NotificationsPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTE_PATHS.TEACHER.AGENT_LOGS,
            element: (
              <SuspenseWrapper>
                <AgentLogsPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTE_PATHS.TEACHER.INTERVENTIONS,
            element: (
              <SuspenseWrapper>
                <TeacherInterventionsPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTE_PATHS.TEACHER.SALES,
            element: (
              <SuspenseWrapper>
                <TeacherSalesPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTE_PATHS.TEACHER.ANALYTICS,
            element: (
              <SuspenseWrapper>
                <TeacherAnalyticsPage />
              </SuspenseWrapper>
            ),
          },
        ],
      },
    ],
  },

  /* Admin Routes — gated behind RequireRole("admin"). */
  {
    element: <RequireRole role="admin" />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        path: ROUTE_PATHS.ADMIN.ROOT,
        element: <AdminLayout />,
        children: [
          {
            index: true,
            element: <Navigate to={ROUTE_PATHS.ADMIN.DASHBOARD} replace />,
          },
          {
            path: ROUTE_PATHS.ADMIN.DASHBOARD,
            element: (
              <SuspenseWrapper>
                <AdminDashboardPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTE_PATHS.ADMIN.USERS,
            element: (
              <SuspenseWrapper>
                <AdminUsersPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTE_PATHS.ADMIN.CREATE_ADMIN,
            element: (
              <SuspenseWrapper>
                <AdminCreateAdminPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTE_PATHS.ADMIN.USER_DETAIL,
            element: (
              <SuspenseWrapper>
                <AdminUserDetailPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTE_PATHS.ADMIN.COURSES,
            element: (
              <SuspenseWrapper>
                <AdminCoursesPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTE_PATHS.ADMIN.COURSE_DETAIL,
            element: (
              <SuspenseWrapper>
                <AdminCourseDetailPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTE_PATHS.ADMIN.ORDERS,
            element: (
              <SuspenseWrapper>
                <AdminOrdersPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTE_PATHS.ADMIN.ORDER_DETAIL,
            element: (
              <SuspenseWrapper>
                <AdminOrderDetailPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTE_PATHS.ADMIN.QUIZZES,
            element: (
              <SuspenseWrapper>
                <AdminQuizzesPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTE_PATHS.ADMIN.QUIZ_DETAIL,
            element: (
              <SuspenseWrapper>
                <AdminQuizDetailPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTE_PATHS.ADMIN.DOCUMENTS,
            element: (
              <SuspenseWrapper>
                <AdminDocumentsPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTE_PATHS.ADMIN.INTERVENTIONS,
            element: (
              <SuspenseWrapper>
                <AdminInterventionsPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTE_PATHS.ADMIN.NOTIFICATIONS,
            element: (
              <SuspenseWrapper>
                <NotificationsPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTE_PATHS.ADMIN.NOTIFICATIONS_LOG,
            element: (
              <SuspenseWrapper>
                <AdminNotificationsLogPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTE_PATHS.ADMIN.AGENT_LOGS,
            element: (
              <SuspenseWrapper>
                <AdminAgentLogsPage />
              </SuspenseWrapper>
            ),
          },
        ],
      },
    ],
  },

  /* Status Pages — full-viewport wrapper: these render with no
     sidebar/topbar shell, so the state component (which only centers
     itself within its own box, for when it's reused inline on a normal
     page) needs an outer box the size of the actual screen to center
     within. */
  {
    path: ROUTE_PATHS.FORBIDDEN,
    element: (
      <div className="flex min-h-screen w-full items-center justify-center">
        <SuspenseWrapper>
          <ForbiddenStatePage />
        </SuspenseWrapper>
      </div>
    ),
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: ROUTE_PATHS.NOT_FOUND,
    element: (
      <div className="flex min-h-screen w-full items-center justify-center">
        <SuspenseWrapper>
          <NotFoundStatePage />
        </SuspenseWrapper>
      </div>
    ),
    errorElement: <RouteErrorBoundary />,
  },

  /* Catch-all 404 Route */
  {
    path: '*',
    element: <Navigate to={ROUTE_PATHS.NOT_FOUND} replace />,
  },
])
