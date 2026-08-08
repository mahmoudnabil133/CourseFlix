import type { PropsWithChildren, ReactNode } from 'react'

type PageHeaderProps = PropsWithChildren<{
  title: string
  description?: string
  actions?: ReactNode
  // Status/role chips etc. — rendered inline right after the title, not
  // as a `.section-head` flex child, so they don't get shoved to the far
  // end by the header row's space-between and leave a dead gap.
  badges?: ReactNode
}>

export function PageHeader({ title, description, actions, badges, children }: PageHeaderProps) {
  return (
    <div className="section-head">
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 className="page-title" style={{ marginBottom: description ? undefined : 0 }}>
            {title}
          </h1>
          {badges}
        </div>
        {description && <p className="subtitle" style={{ marginBottom: 0 }}>{description}</p>}
      </div>

      {actions && <div className="actions">{actions}</div>}
      {children}
    </div>
  )
}
