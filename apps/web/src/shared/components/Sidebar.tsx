import { NavLink } from 'react-router'
import { ROUTE_PATHS } from '../../app/routes/route-paths'

export type SidebarProps = {
  role: 'student' | 'teacher' | 'admin'
  userName: string
  activePath: string
  onLogout?: () => void
  isOpen?: boolean
  isRail?: boolean
  onToggle?: () => void
  onToggleRail?: () => void
}

type NavItem = { path: string; label: string; icon: string }

// Only routes that actually exist in router.tsx are listed. The earlier
// version linked to /student/progress, /student/assistant, /teacher/students,
// /teacher/quizzes and /settings — none of which are routed, so every one of
// them dropped the user on the 404 page. They come back as each owner's
// slice ships, not before.
const studentNavItems: NavItem[] = [
  { path: ROUTE_PATHS.STUDENT.DASHBOARD, label: 'الرئيسية', icon: 'home' },
  { path: ROUTE_PATHS.STUDENT.BROWSE, label: 'استكشف الدورات', icon: 'explore' },
  { path: ROUTE_PATHS.STUDENT.COURSES, label: 'دوراتي', icon: 'menu_book' },
  { path: ROUTE_PATHS.STUDENT.NOTIFICATIONS, label: 'الإشعارات', icon: 'notifications' },
  { path: ROUTE_PATHS.STUDENT.INTERVENTIONS, label: 'نقاط تحتاج مراجعة', icon: 'monitoring' },
]

const teacherNavItems: NavItem[] = [
  { path: ROUTE_PATHS.TEACHER.DASHBOARD, label: 'الرئيسية', icon: 'home' },
  { path: ROUTE_PATHS.TEACHER.COURSES, label: 'دوراتي', icon: 'menu_book' },
  { path: ROUTE_PATHS.TEACHER.STUDENTS, label: 'الطلاب', icon: 'groups' },
  { path: ROUTE_PATHS.TEACHER.NOTIFICATIONS, label: 'الإشعارات', icon: 'notifications' },
  { path: ROUTE_PATHS.TEACHER.AGENT_LOGS, label: 'سجل الوكيل', icon: 'smart_toy' },
  { path: ROUTE_PATHS.TEACHER.INTERVENTIONS, label: 'تقارير المتابعة', icon: 'monitoring' },
  { path: ROUTE_PATHS.TEACHER.SALES, label: 'المبيعات', icon: 'payments' },
  { path: ROUTE_PATHS.TEACHER.ANALYTICS, label: 'مساعد التحليلات', icon: 'insights' },
]

// Grows alongside the admin route surface — only nav items whose route
// actually exists yet, same discipline as the other two lists above.
const adminNavItems: NavItem[] = [
  { path: ROUTE_PATHS.ADMIN.DASHBOARD, label: 'الرئيسية', icon: 'home' },
  { path: ROUTE_PATHS.ADMIN.USERS, label: 'المستخدمون', icon: 'manage_accounts' },
  { path: ROUTE_PATHS.ADMIN.COURSES, label: 'الدورات', icon: 'menu_book' },
  { path: ROUTE_PATHS.ADMIN.ORDERS, label: 'الطلبات', icon: 'shopping_cart' },
  { path: ROUTE_PATHS.ADMIN.QUIZZES, label: 'الاختبارات', icon: 'quiz' },
  { path: ROUTE_PATHS.ADMIN.DOCUMENTS, label: 'المستندات', icon: 'description' },
  { path: ROUTE_PATHS.ADMIN.INTERVENTIONS, label: 'تنبيهات المتابعة', icon: 'monitoring' },
  { path: ROUTE_PATHS.ADMIN.NOTIFICATIONS, label: 'الإشعارات', icon: 'notifications' },
  { path: ROUTE_PATHS.ADMIN.NOTIFICATIONS_LOG, label: 'سجل الإشعارات', icon: 'history' },
  { path: ROUTE_PATHS.ADMIN.AGENT_LOGS, label: 'سجل الوكلاء', icon: 'smart_toy' },
]

const NAV_ITEMS_BY_ROLE: Record<SidebarProps['role'], NavItem[]> = {
  student: studentNavItems,
  teacher: teacherNavItems,
  admin: adminNavItems,
}

export function Sidebar({
  role,
  userName,
  onLogout,
  isOpen = true,
  isRail = false,
  onToggle,
  onToggleRail,
}: SidebarProps) {
  const navItems = NAV_ITEMS_BY_ROLE[role]

  if (!isOpen) return null

  return (
    <aside className={`sidebar${isRail ? ' rail' : ''}`}>
      <button
        onClick={onToggleRail ?? onToggle}
        className="icon-btn rail-toggle"
        aria-label={isRail ? 'توسيع القائمة' : 'طي القائمة'}
        type="button"
      >
        <span className="ms">menu_open</span>
      </button>

      <nav>
        {navItems.map((item) => (
          // NavLink, not <a href>: an anchor did a full document load on
          // every nav click, remounting the app and flashing the login
          // screen before the session re-resolved.
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            {({ isActive }) => (
              <>
                <span className={`ms${isActive ? ' fill' : ''}`}>{item.icon}</span>
                <span className="lbl">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="side-footer">
        {/* Not a link — there is no settings route yet. Kept as a plain
            identity row so the sidebar still shows who is signed in. */}
        <div className="nav-item profile-item" title={userName}>
          <span className="avatar">
            <span className="ms">person</span>
          </span>
          <span className="lbl">{userName}</span>
        </div>

        <button onClick={onLogout} className="nav-item logout" type="button">
          <span className="ms">logout</span>
          <span className="lbl">تسجيل الخروج</span>
        </button>
      </div>
    </aside>
  )
}
