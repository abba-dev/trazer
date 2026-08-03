import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import type { Issue } from '../../lib/api'
import { trazeFilterPlugins, type TrazeCriteria, type TrazeField } from '../../lib/traze'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'

export function TrazeFilterBar({
  issues,
  criteria,
  onChange,
}: {
  issues: Issue[]
  criteria: TrazeCriteria
  onChange: (next: TrazeCriteria) => void
}) {
  const [open, setOpen] = useState(false)
  const [addField, setAddField] = useState<TrazeField>('status')

  const toggle = (field: TrazeField, value: string) => {
    const current = criteria[field]
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
    onChange({ ...criteria, [field]: next })
  }

  const clear = () => onChange({ status: [], priority: [], type: [], assignee: [] })

  const activeCount = Object.values(criteria).reduce((sum, arr) => sum + arr.length, 0)
  const fields = Object.values(trazeFilterPlugins)

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Filters</span>

      {fields.map((plugin) => {
        const values = plugin.options(issues)
        const selected = criteria[plugin.id]
        const visible = values.filter((v) => selected.includes(v))
        if (visible.length === 0) return null
        return (
          <div key={plugin.id} className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground/70">{plugin.label}</span>
            {visible.map((v) => (
              <button
                key={v}
                onClick={() => toggle(plugin.id, v)}
                className="press-pulse flex items-center gap-1 rounded-md border bg-primary/15 px-2 py-0.5 text-xs font-medium text-foreground hover:bg-primary/25"
                title={`Remove ${plugin.label} = ${v}`}
              >
                {v}
                <X className="size-3 opacity-60" />
              </button>
            ))}
          </div>
        )
      })}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              'press-pulse flex items-center gap-1 rounded-md border border-dashed px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:border-solid hover:text-foreground',
              activeCount > 0 && 'border-solid text-foreground',
            )}
          >
            <Plus className="size-3" /> Add filter
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-3">
          <div className="grid gap-2">
            <div className="grid gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Field</label>
              <div className="flex flex-wrap gap-1">
                {fields.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setAddField(f.id)}
                    className={cn(
                      'rounded-md border px-2 py-0.5 text-xs font-medium transition-colors',
                      addField === f.id
                        ? 'border-primary/40 bg-primary/15 text-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Value</label>
              <div className="flex flex-wrap gap-1">
                {trazeFilterPlugins[addField].options(issues).map((v) => {
                  const isSelected = criteria[addField].includes(v)
                  return (
                    <button
                      key={v}
                      onClick={() => {
                        toggle(addField, v)
                        setOpen(false)
                      }}
                      className={cn(
                        'rounded-md border px-2 py-0.5 text-xs font-medium transition-colors',
                        isSelected
                          ? 'border-primary/40 bg-primary/15 text-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                      )}
                    >
                      {v}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="flex justify-end">
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {activeCount > 0 && (
        <button onClick={clear} className="text-[10px] text-muted-foreground hover:text-foreground" title="Clear all filters">
          Clear
        </button>
      )}
    </div>
  )
}
