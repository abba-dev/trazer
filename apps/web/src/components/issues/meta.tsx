import type { Issue, Priority, Status, Type } from '../../lib/api'
import { cn } from '../../lib/utils'

export const STATUS_META: Record<Status, { label: string; dot: string; bg: string }> = {
  ToDo: { label: 'To Do', dot: 'bg-muted-foreground', bg: 'bg-muted' },
  InProgress: { label: 'In Progress', dot: 'bg-blue-500', bg: 'bg-blue-500/10' },
  InReview: { label: 'In Review', dot: 'bg-purple-500', bg: 'bg-purple-500/10' },
  QA: { label: 'QA', dot: 'bg-amber-500', bg: 'bg-amber-500/10' },
  Done: { label: 'Done', dot: 'bg-emerald-500', bg: 'bg-emerald-500/10' },
}

export const PRIORITY_META: Record<Priority, { label: string; color: string; icon: 'low' | 'medium' | 'high' | 'urgent' }> = {
  Low: { label: 'Low', color: 'text-muted-foreground', icon: 'low' },
  Medium: { label: 'Medium', color: 'text-sky-600 dark:text-sky-400', icon: 'medium' },
  High: { label: 'High', color: 'text-amber-600 dark:text-amber-400', icon: 'high' },
  Urgent: { label: 'Urgent', color: 'text-red-600 dark:text-red-400', icon: 'urgent' },
}

export const TYPE_META: Record<Type, { label: string; color: string }> = {
  Task: { label: 'Task', color: 'text-sky-600 dark:text-sky-400' },
  Bug: { label: 'Bug', color: 'text-red-600 dark:text-red-400' },
  Story: { label: 'Story', color: 'text-emerald-600 dark:text-emerald-400' },
}

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const meta = STATUS_META[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium',
        meta.bg,
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  )
}

export function TypeBadge({ type }: { type: Type }) {
  const meta = TYPE_META[type]
  return (
    <span className={cn('text-xs font-semibold', meta.color)}>
      {meta.label}
    </span>
  )
}

export function PriorityIcon({ priority, className }: { priority: Priority; className?: string }) {
  const meta = PRIORITY_META[priority]
  return (
    <svg
      viewBox="0 0 16 16"
      className={cn('size-3.5 shrink-0', meta.color, className)}
      fill="currentColor"
      aria-label={`Priority: ${meta.label}`}
     
    >
      {meta.icon === 'low' && <path d="M3 13h10v1.5H3z" opacity={0.55} />}
      {meta.icon === 'medium' && (
        <>
          <path d="M3 13h10v1.5H3z" opacity={0.55} />
          <path d="M3 8h10v1.5H3z" />
        </>
      )}
      {meta.icon === 'high' && (
        <>
          <path d="M3 13h10v1.5H3z" opacity={0.4} />
          <path d="M3 8h10v1.5H3z" opacity={0.7} />
          <path d="M3 3h10v1.5H3z" />
        </>
      )}
      {meta.icon === 'urgent' && (
        <>
          <path d="M3 13h10v1.5H3z" opacity={0.35} />
          <path d="M3 8h10v1.5H3z" opacity={0.6} />
          <path d="M3 3h10v1.5H3z" />
          <path d="M8 .5 1 6.5h14z" transform="rotate(180 8 3.5)" />
        </>
      )}
    </svg>
  )
}

export function LabelChip({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="inline-flex items-center rounded-sm border px-1.5 py-0.5 text-xs font-medium text-foreground"
      style={{ borderColor: `${color}66`, backgroundColor: `${color}1a` }}
    >
      <span className="mr-1.5 size-1.5 rounded-full" style={{ backgroundColor: color }} />
      {name}
    </span>
  )
}

export function EstimateChip({ estimate }: { estimate: number | null }) {
  if (estimate == null) return null
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="Estimate">
      <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor">
        <path d="M8 0a8 8 0 1 0 8 8A8 8 0 0 0 8 0zm3.5 10.3-4.5 2.3a1 1 0 0 1-1.35-.45L3.7 6.2a1 1 0 0 1 1.35-1.35l6.05 2.9A1 1 0 0 1 11.5 10.3z" />
      </svg>
      {estimate}
    </span>
  )
}

export function Avatar({ name, size = 6 }: { name: string; size?: 6 | 7 | 8 }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
  const palette = ['bg-blue-500/20 text-blue-600 dark:text-blue-400', 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400', 'bg-amber-500/20 text-amber-600 dark:text-amber-400', 'bg-purple-500/20 text-purple-600 dark:text-purple-400', 'bg-rose-500/20 text-rose-600 dark:text-rose-400']
  const color = palette[(name.length + name.charCodeAt(0)) % palette.length]
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold',
        color,
        size === 6 && 'size-6 text-[10px]',
        size === 7 && 'size-7 text-xs',
        size === 8 && 'size-8 text-sm',
      )}
      title={name}
    >
      {initials}
    </span>
  )
}

export function IssueAvatar({ issue }: { issue: Issue }) {
  return issue.assignee ? (
    <Avatar name={issue.assignee.name} />
  ) : (
    <span className="inline-flex size-6 items-center justify-center rounded-full border border-dashed text-muted-foreground" title="Unassigned">
      <span className="text-[10px]">—</span>
    </span>
  )
}
