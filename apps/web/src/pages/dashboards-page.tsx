import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, Loader2, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
import { searchApi, type Issue } from '../lib/api'
import { queryKeys } from '../lib/query-keys'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover'
import { cn } from '../lib/utils'

type WidgetKind = 'count' | 'byStatus' | 'byPriority' | 'byAssignee' | 'byType' | 'sumEstimate'

type Widget = { id: string; kind: WidgetKind; title: string; query: string }
type Dashboard = { id: string; name: string; widgets: Widget[] }

const STORAGE_KEY = 'trazer.dashboards'
const DEFAULT_WIDGETS = (): Widget[] => [
  { id: 'w1', kind: 'count', title: 'Total issues', query: '' },
  { id: 'w2', kind: 'byStatus', title: 'By status', query: '' },
  { id: 'w3', kind: 'byPriority', title: 'By priority', query: '' },
  { id: 'w4', kind: 'byAssignee', title: 'By assignee', query: '' },
]

function load(): Dashboard[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) return arr
    }
  } catch {
    /* ignore */
  }
  return [
    { id: 'd1', name: 'Overview', widgets: DEFAULT_WIDGETS() },
  ]
}

function save(dashboards: Dashboard[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dashboards))
  } catch {
    /* ignore */
  }
}

const WIDGET_KINDS: { id: WidgetKind; label: string }[] = [
  { id: 'count', label: 'Count' },
  { id: 'byStatus', label: 'By status' },
  { id: 'byPriority', label: 'By priority' },
  { id: 'byAssignee', label: 'By assignee' },
  { id: 'byType', label: 'By type' },
  { id: 'sumEstimate', label: 'Sum estimate' },
]

export function DashboardsPage() {
  const [dashboards, setDashboards] = useState<Dashboard[]>(load)
  const [activeId, setActiveId] = useState<string>(dashboards[0]?.id ?? '')
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')

  const active = dashboards.find((d) => d.id === activeId) ?? dashboards[0]

  const update = (next: Dashboard[]) => {
    setDashboards(next)
    save(next)
  }

  const addDashboard = () => {
    if (!newName.trim()) return
    const d: Dashboard = { id: `d${Date.now()}`, name: newName.trim(), widgets: DEFAULT_WIDGETS() }
    update([...dashboards, d])
    setActiveId(d.id)
    setNewName('')
    setCreateOpen(false)
  }

  const removeDashboard = (id: string) => {
    if (!confirm('Delete this dashboard?')) return
    const next = dashboards.filter((d) => d.id !== id)
    update(next.length ? next : [{ id: 'd1', name: 'Overview', widgets: DEFAULT_WIDGETS() }])
    setActiveId(next[0]?.id ?? 'd1')
  }

  const addWidget = (kind: WidgetKind) => {
    if (!active) return
    const w: Widget = {
      id: `w${Date.now()}`,
      kind,
      title: WIDGET_KINDS.find((k) => k.id === kind)?.label ?? kind,
      query: '',
    }
    const next = dashboards.map((d) => (d.id === active.id ? { ...d, widgets: [...d.widgets, w] } : d))
    update(next)
  }

  const removeWidget = (wid: string) => {
    if (!active) return
    const next = dashboards.map((d) => (d.id === active.id ? { ...d, widgets: d.widgets.filter((w) => w.id !== wid) } : d))
    update(next)
  }

  const updateWidget = (wid: string, patch: Partial<Widget>) => {
    if (!active) return
    const next = dashboards.map((d) =>
      d.id === active.id ? { ...d, widgets: d.widgets.map((w) => (w.id === wid ? { ...w, ...patch } : w)) } : d,
    )
    update(next)
  }

  if (!active) return null

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-56 shrink-0 border-r bg-card/40 px-3 py-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dashboards</h2>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setCreateOpen(true)}>
            <Plus className="size-3.5" />
          </Button>
        </div>
        <ul className="space-y-0.5">
          {dashboards.map((d) => (
            <li key={d.id}>
              <button
                onClick={() => setActiveId(d.id)}
                className={cn(
                  'group flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                  d.id === activeId ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                )}
              >
                <span className="truncate">{d.name}</span>
                {dashboards.length > 1 && (
                  <span
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeDashboard(d.id)
                    }}
                    className="hidden text-muted-foreground/60 hover:text-destructive group-hover:inline"
                  >
                    <Trash2 className="size-3" />
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="flex-1 overflow-auto p-6">
        <div className="mb-5 flex items-center gap-2">
          <BarChart3 className="size-5 text-muted-foreground" />
          <Input
            value={active.name}
            onChange={(e) => update(dashboards.map((d) => (d.id === active.id ? { ...d, name: e.target.value } : d)))}
            className="h-7 max-w-xs border-transparent bg-transparent px-1 text-lg font-semibold hover:border-border focus:border-border"
          />
          <span className="text-xs text-muted-foreground">{active.widgets.length} widgets</span>
          <AddWidgetMenu onAdd={addWidget} />
        </div>

        <div className="grid auto-rows-min grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {active.widgets.map((w) => (
            <WidgetCard key={w.id} widget={w} onUpdate={(patch) => updateWidget(w.id, patch)} onRemove={() => removeWidget(w.id)} />
          ))}
          {active.widgets.length === 0 && (
            <p className="col-span-full rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
              No widgets yet. Add one with the + button above.
            </p>
          )}
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New dashboard</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="Dashboard name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addDashboard()}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={addDashboard} disabled={!newName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function AddWidgetMenu({ onAdd }: { onAdd: (kind: WidgetKind) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="ml-auto">
          <Plus className="size-4" /> Add widget
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 p-1">
        {WIDGET_KINDS.map((k) => (
          <button
            key={k.id}
            onClick={() => onAdd(k.id)}
            className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {k.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

function WidgetCard({ widget, onUpdate, onRemove }: { widget: Widget; onUpdate: (patch: Partial<Widget>) => void; onRemove: () => void }) {
  const { data, isPending } = useQuery({
    queryKey: ['dashboard-widget', widget.id, widget.query],
    queryFn: () => searchApi.query(widget.query || 'project = *'),
    enabled: true,
    staleTime: 30_000,
  })

  const computed = useMemo(() => compute(data ?? [], widget.kind), [data, widget.kind])

  return (
    <div className="rounded-lg border bg-card p-4 transition-shadow hover:shadow-sm">
      <div className="mb-3 flex items-center gap-1">
        <Input
          value={widget.title}
          onChange={(e) => onUpdate({ title: e.target.value })}
          className="h-7 border-transparent bg-transparent px-1 text-sm font-semibold hover:border-border focus:border-border"
        />
        <Popover>
          <PopoverTrigger asChild>
            <button className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
              <MoreHorizontal className="size-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 p-2">
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">TQ query</p>
            <Input
              placeholder="e.g. status != Done AND priority = High"
              value={widget.query}
              onChange={(e) => onUpdate({ query: e.target.value })}
              className="mb-2 h-7 text-xs"
            />
            <button
              onClick={onRemove}
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
            >
              <Trash2 className="size-3.5" /> Remove widget
            </button>
          </PopoverContent>
        </Popover>
      </div>

      {isPending ? (
        <div className="flex h-20 items-center justify-center">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <WidgetBody data={computed} kind={widget.kind} />
      )}
    </div>
  )
}

function compute(issues: Issue[], kind: WidgetKind) {
  if (kind === 'count') return [{ label: 'Issues', value: issues.length }]
  if (kind === 'sumEstimate') return [{ label: 'Points', value: issues.reduce((s, i) => s + (i.estimate ?? 0), 0) }]
  const map = new Map<string, number>()
  const order: string[] = []
  for (const i of issues) {
    const k = kind === 'byStatus' ? i.status : kind === 'byPriority' ? i.priority : kind === 'byType' ? i.type : (i.assignee?.name ?? 'Unassigned')
    if (!map.has(k)) order.push(k)
    map.set(k, (map.get(k) ?? 0) + 1)
  }
  const sortOrder: Record<string, string[]> = {
    byStatus: ['ToDo', 'InProgress', 'InReview', 'QA', 'Done'],
    byPriority: ['Urgent', 'High', 'Medium', 'Low'],
    byType: ['Bug', 'Story', 'Task'],
  }
  const final = (sortOrder[kind] ?? []).filter((k) => map.has(k))
  const extra = order.filter((k) => !final.includes(k)).sort((a, b) => (map.get(b) ?? 0) - (map.get(a) ?? 0))
  return [...final, ...extra].map((k) => ({ label: k, value: map.get(k) ?? 0 }))
}

function WidgetBody({ data, kind }: { data: { label: string; value: number }[]; kind: WidgetKind }) {
  if (kind === 'count' || kind === 'sumEstimate') {
    return (
      <div className="py-2">
        <p className="font-mono text-3xl font-semibold tabular-nums">{data[0]?.value}</p>
        <p className="text-xs text-muted-foreground">{data[0]?.label}</p>
      </div>
    )
  }
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <ul className="space-y-1.5">
      {data.map((d) => (
        <li key={d.label} className="grid grid-cols-[1fr_auto] items-center gap-2 text-xs">
          <div className="flex min-w-0 items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500 ease-[var(--ease-out-quart)]"
                style={{ width: `${(d.value / max) * 100}%` }}
              />
            </div>
            <span className="w-20 shrink-0 truncate text-muted-foreground">{d.label}</span>
          </div>
          <span className="font-mono font-semibold tabular-nums">{d.value}</span>
        </li>
      ))}
    </ul>
  )
}
