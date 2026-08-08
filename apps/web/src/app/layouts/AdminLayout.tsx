import { useState } from 'react'
import type { PropsWithChildren } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../../features/auth/hooks/useAuth'
import { useUnreadNotificationsCount } from '../../features/notifications/hooks/useUnreadNotificationsCount'
import { Sidebar } from '../../shared/components/Sidebar'
import { Topbar } from '../../shared/components/Topbar'
import { ROUTE_PATHS } from '../routes/route-paths'

// No FloatingAssistant here — the AI course tutor doesn't have a role to
// play in an admin operator's workflow.
export function AdminLayout({ children }: PropsWithChildren) {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [isRail, setIsRail] = useState(false)
  const unreadCount = useUnreadNotificationsCount()

  async function handleLogout() {
    await logout()
    navigate(ROUTE_PATHS.LOGIN, { replace: true })
  }

  return (
    <div className="app">
      <Sidebar
        role="admin"
        userName={user?.fullName ?? ''}
        activePath={location.pathname}
        onLogout={() => void handleLogout()}
        isRail={isRail}
        onToggleRail={() => setIsRail((prev) => !prev)}
      />

      <div className="main">
        <div className="sheet">
          <Topbar
            notificationCount={unreadCount}
            notificationsPath={ROUTE_PATHS.ADMIN.NOTIFICATIONS}
            onSettingsClick={() => {}}
            onLogoClick={() => navigate(ROUTE_PATHS.ADMIN.DASHBOARD)}
          />

          <div className="page">{children ?? <Outlet />}</div>
        </div>
      </div>
    </div>
  )
}
