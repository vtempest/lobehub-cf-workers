import type { ReactNode } from "react"

interface PageHeaderProps {
  title: string
  description?: string
  /** Actions rendered on the trailing edge — buttons, menus, filters. */
  actions?: ReactNode
}

/**
 * Standard heading for dashboard and settings pages, so every surface states
 * what it is before showing controls.
 */
export function PageHeader({ actions, description, title }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
