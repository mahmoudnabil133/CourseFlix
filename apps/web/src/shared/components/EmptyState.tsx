import { BellOff } from 'lucide-react'

type EmptyStateVariant = 'default' | 'search' | 'notifications' | 'courses'

type EmptyStateProps = {
  title?: string
  message?: string
  actionLabel?: string
  onAction?: () => void
  variant?: EmptyStateVariant
  // Set when this is the page's only content (a list/table with zero
  // rows) — fills and centers within the full page instead of the
  // compact size used when it's one section among several (e.g. a
  // dashboard's "recent courses" panel below other content).
  fullPage?: boolean
}

const variantIllustrations: Record<string, string> = {
  default: '/illustrations/empty-default.png',
  search: '/illustrations/empty-search.png',
  courses: '/illustrations/empty-courses.png',
}

export function EmptyState({
  title = 'لا يوجد محتوى لعرضه',
  message = 'لم نجد أي بيانات هنا حتى الآن',
  actionLabel,
  onAction,
  variant = 'default',
  fullPage = false,
}: EmptyStateProps) {
  const illustrationSrc = variantIllustrations[variant]
  const isNotifications = variant === 'notifications'

  return (
    <div className={`empty-state${fullPage ? ' empty-state--full-page' : ''}`} role="status">
      {/* Illustration or icon inside circular container */}
      <div className={`empty-state__blob${isNotifications ? ' empty-state__blob--icon' : ''}`}>
        {isNotifications ? (
          <div className="empty-state__icon-wrap">
            <BellOff
              size={58}
              strokeWidth={1.5}
              aria-hidden="true"
              className="empty-state__icon"
            />
            {/* Decorative zzz sleep letters */}
            <span className="empty-state__zzz empty-state__zzz--1" aria-hidden="true">z</span>
            <span className="empty-state__zzz empty-state__zzz--2" aria-hidden="true">z</span>
            <span className="empty-state__zzz empty-state__zzz--3" aria-hidden="true">Z</span>
          </div>
        ) : (
          <img
            src={illustrationSrc}
            alt=""
            aria-hidden="true"
            draggable={false}
            className="empty-state__img"
          />
        )}
      </div>

      {/* Text content */}
      <div className="empty-state__text">
        <h3 className="empty-state__title">{title}</h3>
        <p className="empty-state__message">{message}</p>
      </div>

      {/* Action button */}
      {actionLabel && onAction && (
        <button onClick={onAction} className="empty-state__btn">
          {actionLabel}
        </button>
      )}

      <style>{`
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 20px;
          padding: 48px 24px 56px;
          text-align: center;
        }

        /* Fill the page, not just the width its own content needs — same
           min-height/width ErrorState already uses, so a genuinely empty
           page reads as a real full-screen state instead of a small icon
           stuck wherever it fell in the flow. Only applied when this is
           the page's sole content (fullPage prop) — a dashboard's inline
           "no recent courses yet" panel stays compact. */
        .empty-state--full-page {
          min-height: 60vh;
          width: 100%;
        }

        /* Circular blob container behind the illustration */
        .empty-state__blob {
          width: 240px;
          height: 240px;
          border-radius: 50%;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--secondary-container);
          flex-shrink: 0;
        }

        /* Icon-only variant (notifications) — same container, amber theme */
        .empty-state__blob--icon {
          background: #fffbeb;
          overflow: visible;            /* allow zzz to overflow */
        }

        .empty-state__icon-wrap {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .empty-state__icon {
          color: #f59e0b;               /* amber-500 */
        }

        /* Decorative zzz sleep letters */
        .empty-state__zzz {
          position: absolute;
          font-weight: 700;
          font-style: italic;
          color: #fcd34d;               /* amber-300 */
          user-select: none;
          pointer-events: none;
          line-height: 1;
        }
        .empty-state__zzz--1 {
          font-size: 8px;
          top: -4px;
          right: -8px;
          opacity: 0.6;
        }
        .empty-state__zzz--2 {
          font-size: 11px;
          top: -14px;
          right: -18px;
          opacity: 0.8;
        }
        .empty-state__zzz--3 {
          font-size: 14px;
          top: -26px;
          right: -30px;
          opacity: 1;
          color: #f59e0b;               /* amber-500 — darkest Z */
        }

        .empty-state__img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          user-select: none;
          pointer-events: none;
          mix-blend-mode: multiply;     /* makes white areas transparent */
        }

        .empty-state__title {
          font-size: 1.25rem;
          font-weight: 700;
          color: var(--on-surface);
          margin: 0;
          line-height: 1.4;
        }

        .empty-state__message {
          font-size: 0.9rem;
          color: var(--on-surface-variant);
          max-width: 320px;
          line-height: 1.7;
          margin: 0 auto;
        }

        .empty-state__text {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .empty-state__btn {
          margin-top: 4px;
          padding: 12px 32px;
          background-color: var(--primary);
          color: var(--on-primary);
          font-size: 0.95rem;
          font-weight: 600;
          border-radius: 10px;
          border: none;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: var(--shadow);
          letter-spacing: 0.01em;
        }
        .empty-state__btn:hover {
          filter: brightness(1.06);
          transform: translateY(-1px);
          box-shadow: var(--shadow);
        }
        .empty-state__btn:active {
          transform: scale(0.97);
        }

        /* ── Dark mode ─────────────────────────────────
           Keyed off the explicit .dark class, not
           prefers-color-scheme: the OS query would override a
           deliberate "light" choice on a dark-OS machine. */
        :where(.dark, .dark *) .empty-state__blob--icon {
          background: rgba(120, 53, 15, 0.3);
        }

        :where(.dark, .dark *) .empty-state__icon {
          color: #fbbf24;
        }

        :where(.dark, .dark *) .empty-state__zzz {
          color: rgba(251, 191, 36, 0.35);
        }
        :where(.dark, .dark *) .empty-state__zzz--3 {
          color: rgba(251, 191, 36, 0.6);
        }
      `}</style>
    </div>
  )
}
