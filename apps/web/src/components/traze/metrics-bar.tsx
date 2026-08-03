import { Settings2 } from 'lucide-react'
import { useState } from 'react'
import type { Issue } from '../../lib/api'
import { trazeMetricPlugins, trazeMetricList } from '../../lib/traze'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { cn } from '../../lib/utils'

export function TrazeMetricsBar({
  issues,
  enabled,
  onToggle,
}: {
  issues: Issue[]
  enabled: string[]
  onToggle: (id: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex flex-wrap items-stretch gap-2">
      <span className="flex items-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Metrics</span>
      {enabled.map((id) => {
        const plugin = trazeMetricPlugins[id]
        if (!plugin) return null
        const data = plugin.compute(issues)
        return (
          <div key={id} className="flex items-stretch overflow-hidden rounded-md border bg-card/60">
            <div className="flex items-center bg-secondary/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {plugin.label}
            </div>
            <div className="flex items-center gap-2 px-2.5 py-1">
              {data.map((d, i) => (
                <span key={i} className="flex items-center gap-1 text-xs">
                  <span className="font-mono text-sm font-semibold tabular-nums text-foreground">{d.value}</span>
                  <span className="text-muted-foreground">{d.label}</span>
                </span>
              ))}
            </div>
          </div>
        )
      })}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className="flex items-center gap-1 self-stretch rounded-md border border-dashed px-2 text-xs text-muted-foreground hover:border-solid hover:text-foreground"
            title="Customize metrics"
          >
            <Settings2 className="size-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56 p-2">
          <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Plugins</p>
          {trazeMetricList.map((m) => {
            const isOn = enabled.includes(m.id)
            return (
              <button
                key={m.id}
                onClick={() => onToggle(m.id)}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                  isOn ? 'bg-primary/15 text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <span>{m.label}</span>
                <span className="text-[10px] uppercase tracking-wider opacity-60">{isOn ? 'on' : 'off'}</span>
              </button>
            )
          })}
        </PopoverContent>
      </Popover>
    </div>
  )
}
