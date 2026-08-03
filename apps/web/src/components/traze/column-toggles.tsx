import { cn } from '../../lib/utils'

export type ToggleColumn = { key: string; label: string; dot: string }

export function ColumnToggles({
  hidden,
  onToggle,
  counts,
  columns,
}: {
  hidden: Set<string>
  onToggle: (key: string) => void
  counts: Record<string, number>
  columns: ToggleColumn[]
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Columns</span>
      {columns.map((col) => {
        const isHidden = hidden.has(col.key)
        return (
          <button
            key={col.key}
            onClick={() => onToggle(col.key)}
            className={cn(
              'press-pulse flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors',
              isHidden
                ? 'border-dashed text-muted-foreground/60 hover:text-foreground'
                : 'bg-secondary/40 text-foreground hover:bg-accent',
            )}
            title={isHidden ? `Show ${col.label}` : `Hide ${col.label}`}
          >
            <span className={cn('size-1.5 rounded-full', col.dot, isHidden && 'opacity-40')} />
            <span className={isHidden ? 'line-through' : ''}>{col.label}</span>
            <span className="rounded bg-muted/60 px-1 text-[10px] tabular-nums text-muted-foreground">{counts[col.key] ?? 0}</span>
          </button>
        )
      })}
    </div>
  )
}
