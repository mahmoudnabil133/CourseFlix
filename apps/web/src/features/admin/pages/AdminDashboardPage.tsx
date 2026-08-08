import { Link } from 'react-router'
import { useAuth } from '../../auth/hooks/useAuth'
import { ErrorState } from '../../../shared/components/ErrorState'
import { LoadingState } from '../../../shared/components/LoadingState'
import { ROUTE_PATHS } from '../../../app/routes/route-paths'
import { useAdminAnalyticsOverview } from '../hooks/useAdminAnalyticsOverview'
import { useAdminUsers } from '../hooks/useAdminUsers'
import { useAdminOrders } from '../hooks/useAdminOrders'
import { useAdminInterventions } from '../hooks/useAdminInterventions'
import { USER_ROLE_LABEL } from '../lib/user-labels'
import { ORDER_STATUS_LABEL } from '../lib/order-labels'

// Kept low deliberately: plain, naturally-sized rows (no height/overflow
// tricks anywhere on this page — those kept producing their own tiny
// internal scrollbars) so the whole page comfortably fits one screen on
// its own.
const RECENT_ITEMS_LIMIT = 3

const RULE_LABELS: Record<string, string> = {
  low_quiz_score: 'نتيجة اختبار منخفضة',
  explicit_confusion_phrase: 'صعوبة في الفهم',
  repeated_concept_question: 'سؤال متكرر',
}

function formatMoney(minor: number, currency: string) {
  return `${(minor / 100).toLocaleString('ar-EG')} ${currency}`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function AdminDashboardPage() {
  const { user } = useAuth()
  const overview = useAdminAnalyticsOverview()
  const recentUsers = useAdminUsers({})
  const recentOrders = useAdminOrders({})
  const activeInterventions = useAdminInterventions({ status: 'active' })

  return (
    <>
      <h1 className="page-title" style={{ marginBottom: 2 }}>
        أهلاً، {user?.fullName ?? 'أدمن'}
      </h1>
      <p className="subtitle">لوحة تحكم الأدمن — إدارة المنصة بالكامل من مكان واحد</p>

      {overview.isLoading && <LoadingState variant="cards" />}

      {!overview.isLoading && overview.error && (
        <ErrorState
          title="تعذر تحميل الإحصائيات"
          message="لم نتمكن من تحميل نظرة عامة على المنصة."
          onRetry={overview.refetch}
        />
      )}

      {!overview.isLoading && !overview.error && overview.data && (
        <div className="tiles section">
          <Link to={ROUTE_PATHS.ADMIN.USERS} className="tile" style={{ cursor: 'pointer' }}>
            <span className="lead-ic">
              <span className="ms">manage_accounts</span>
            </span>
            <span className="lbl">المستخدمون</span>
            <span className="num">{overview.data.users.total}</span>
            <span className="meta">
              {overview.data.users.students} طالب · {overview.data.users.teachers} معلم ·{' '}
              {overview.data.users.admins} أدمن
            </span>
          </Link>

          <Link to={ROUTE_PATHS.ADMIN.COURSES} className="tile" style={{ cursor: 'pointer' }}>
            <span className="lead-ic">
              <span className="ms">menu_book</span>
            </span>
            <span className="lbl">الدورات</span>
            <span className="num">{overview.data.courses.total}</span>
            <span className="meta">
              {overview.data.courses.published} منشورة · {overview.data.courses.draft} مسودة
            </span>
          </Link>

          <Link to={ROUTE_PATHS.ADMIN.ORDERS} className="tile" style={{ cursor: 'pointer' }}>
            <span className="lead-ic">
              <span className="ms">payments</span>
            </span>
            <span className="lbl">الإيرادات</span>
            <span className="num" style={{ wordBreak: 'break-word' }}>
              {formatMoney(overview.data.commerce.revenueMinor, overview.data.commerce.currency)}
            </span>
            <span className="meta">
              {overview.data.commerce.paidOrders} من {overview.data.commerce.totalOrders} طلب مدفوع
            </span>
          </Link>

          <Link to={ROUTE_PATHS.ADMIN.INTERVENTIONS} className="tile" style={{ cursor: 'pointer' }}>
            <span className="lead-ic">
              <span className="ms">monitoring</span>
            </span>
            <span className="lbl">تنبيهات نشطة</span>
            <span className="num">{overview.data.interventions.active}</span>
          </Link>
        </div>
      )}

      <div className="grid-2 section">
        <div className="card">
          <div className="section-head" style={{ marginBottom: 0 }}>
            <h3>أحدث المستخدمين</h3>
            <Link to={ROUTE_PATHS.ADMIN.USERS} className="btn text">
              عرض الكل
            </Link>
          </div>
          {recentUsers.isLoading && <LoadingState variant="list" count={3} />}
          {!recentUsers.isLoading && recentUsers.data && recentUsers.data.length === 0 && (
            <p className="meta">لا يوجد مستخدمون بعد</p>
          )}
          {!recentUsers.isLoading &&
            recentUsers.data?.slice(0, RECENT_ITEMS_LIMIT).map((item) => (
              <Link
                key={item.id}
                to={`/admin/users/${item.id}`}
                style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid var(--outline-variant)' }}
              >
                <span>{item.fullName}</span>
                <span className={`chip ${USER_ROLE_LABEL[item.role].chip}`}>{USER_ROLE_LABEL[item.role].label}</span>
              </Link>
            ))}
        </div>

        <div className="card">
          <div className="section-head" style={{ marginBottom: 0 }}>
            <h3>أحدث الطلبات</h3>
            <Link to={ROUTE_PATHS.ADMIN.ORDERS} className="btn text">
              عرض الكل
            </Link>
          </div>
          {recentOrders.isLoading && <LoadingState variant="list" count={3} />}
          {!recentOrders.isLoading && recentOrders.data && recentOrders.data.length === 0 && (
            <p className="meta">لا توجد طلبات بعد</p>
          )}
          {!recentOrders.isLoading &&
            recentOrders.data?.slice(0, RECENT_ITEMS_LIMIT).map((item) => (
              <Link
                key={item.id}
                to={`/admin/orders/${item.id}`}
                style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid var(--outline-variant)' }}
              >
                <span>{item.studentName}</span>
                <span className={`chip ${ORDER_STATUS_LABEL[item.status].chip}`}>
                  {formatMoney(item.totalMinor, item.currency)}
                </span>
              </Link>
            ))}
        </div>
      </div>

      <div className="card">
        <div className="section-head" style={{ marginBottom: 0 }}>
          <h3>تنبيهات متابعة نشطة</h3>
          <Link to={ROUTE_PATHS.ADMIN.INTERVENTIONS} className="btn text">
            عرض الكل
          </Link>
        </div>
        {activeInterventions.isLoading && <LoadingState variant="list" count={3} />}
        {!activeInterventions.isLoading && activeInterventions.data && activeInterventions.data.length === 0 && (
          <p className="meta">لا توجد تنبيهات نشطة حاليًا</p>
        )}
        {!activeInterventions.isLoading &&
          activeInterventions.data?.slice(0, RECENT_ITEMS_LIMIT).map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '6px 0',
                borderTop: '1px solid var(--outline-variant)',
              }}
            >
              <span>
                {item.studentName} — {RULE_LABELS[item.ruleKey] ?? item.ruleKey}
              </span>
              <span className="meta">{formatDate(item.createdAt)}</span>
            </div>
          ))}
      </div>
    </>
  )
}
