import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { useSortable, SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Columns3, GripVertical, Loader2 } from 'lucide-react'
import { issueApi, searchApi, timeAgo, type Issue } from '../lib/api'
import { queryKeys } from '../lib/query-keys'
import { useListNav } from '../lib/use-list-nav'
import { IssueAvatar, LabelChip, PriorityIcon, StatusBadge, TypeBadge } from '../components/issues/meta'
import { IssuePanel } from '../components/issues/issue-panel'
import { TrazeFilterBar } from '../components/traze/filter-bar'
import { applyCriteriaClient, COMMON_TQ_FILTERS, criteriaToTq, emptyCriteria, type TrazeCriteria } from '../lib/traze'
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover'
import { cn } from '../lib/utils'

type ColKey = 'key' | 'title' | 'type' | 'status' | 'priority' | 'assignee' | 'estimate' | 'sprint' | 'epic' | 'labels' | 'created' | 'updated'

type ColDef = { key: ColKey; label: string; minWidth: number; defaultWidth: number }

const ALL_COLUMNS: ColDef[] = [
  { key: 'key', label: 'Key', minWidth: 70, defaultWidth: 90 },
  { key: 'title', label: 'Title', minWidth: 200, defaultWidth: 0 },
  { key: 'type', label: 'Type', minWidth: 70, defaultWidth: 80 },
  { key: 'status', label: 'Status', minWidth: 90, defaultWidth: 110 },
  { key: 'priority', label: 'Pri', minWidth: 32, defaultWidth: 40 },
  { key: 'assignee', label: 'Assignee', minWidth: 36, defaultWidth: 44 },
  { key: 'estimate', label: 'Est', minWidth: 36, defaultWidth: 44 },
  { key: 'sprint', label: 'Sprint', minWidth: 80, defaultWidth: 120 },
  { key: 'epic', label: 'Epic', minWidth: 80, defaultWidth: 120 },
  { key: 'labels', label: 'Labels', minWidth: 80, defaultWidth: 140 },
  { key: 'created', label: 'Created', minWidth: 70, defaultWidth: 90 },
  { key: 'updated', label: 'Updated', minWidth: 70, defaultWidth: 90 },
]

const DEFAULT_ORDER: ColKey[] = ['key', 'title', 'type', 'status', 'priority', 'assignee', 'estimate', 'sprint', 'labels', 'updated']
const DEFAULT_WIDTHS: Record<ColKey, number> = Object.fromEntries(ALL_COLUMNS.map((c) => [c.key, c.defaultWidth])) as Record<ColKey, number>

const ORDER_KEY = 'trazer.issuelist.order'
const WIDTHS_KEY = 'trazer.issuelist.widths'

function loadOrder(): ColKey[] {
  try {
    const raw = localStorage.getItem(ORDER_KEY)
    if (raw) {
      const arr = JSON.parse(raw) as ColKey[]
      if (Array.isArray(arr) && arr.every((c) => ALL_COLUMNS.some((a) => a.key === c))) return arr
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_ORDER
}

function loadWidths(): Record<ColKey, number> {
  try {
    const raw = localStorage.getItem(WIDTHS_KEY)
    if (raw) {
      const obj = JSON.parse(raw) as Record<string, number>
      const out = { ...DEFAULT_WIDTHS }
      for (const k of Object.keys(out) as ColKey[]) {
        if (typeof obj[k] === 'number' && obj[k] > 0) out[k] = obj[k]
      }
      return out
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_WIDTHS
}

export function BacklogPage() {
  const { projectKey } = useParams<{ projectKey: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()

  const [criteria, setCriteria] = useState<TrazeCriteria>(emptyCriteria)
  const [commonFilter, setCommonFilter] = useState<string | null>(null)
  const [order, setOrder] = useState<ColKey[]>(loadOrder)
  const [widths, setWidths] = useState<Record<ColKey, number>>(loadWidths)
  const [hidden, setHidden] = useState<Set<ColKey>>(() => {
    const visible = new Set(loadOrder())
    return new Set(ALL_COLUMNS.map((c) => c.key).filter((k) => !visible.has(k)))
  })

  const cols = useMemo(() => order.filter((k) => !hidden.has(k)).map((k) => ALL_COLUMNS.find((c) => c.key === k)!), [order, hidden])
  const allKeys = useMemo(() => new Set(ALL_COLUMNS.map((c) => c.key)), [])

  const criteriaTq = useMemo(() => criteriaToTq(criteria, projectKey!), [criteria, projectKey])
  const commonTq = commonFilter ? COMMON_TQ_FILTERS[commonFilter]?.query ?? null : null
  const tq = useMemo(() => {
    const parts = [criteriaTq]
    if (commonTq) parts.push(`(${commonTq})`)
    const all = parts.join(' AND ')
    if (all === `project = ${projectKey}`) return null
    return all
  }, [criteriaTq, commonTq, projectKey])

  const { data: serverIssues, isPending } = useQuery({
    queryKey: tq ? queryKeys.search(tq) : queryKeys.issues(projectKey!),
    queryFn: () => (tq ? searchApi.query(tq) : issueApi.list(projectKey!)),
  })

  const filtered = useMemo(() => {
    const list = serverIssues ?? []
    return applyCriteriaClient(list, criteria)
  }, [serverIssues, criteria])

  const sorted = useMemo(() => [...filtered].sort((a, b) => a.position - b.position), [filtered])

  const openIssue = (issue: Issue) => {
    const next = new URLSearchParams(searchParams)
    next.set('issue', issue.key)
    setSearchParams(next)
  }

  const { selectedIndex, setItemRef } = useListNav({
    items: sorted,
    enabled: sorted.length > 0 && !isPending,
    onOpen: (issue) => {
      void queryClient.prefetchQuery({ queryKey: queryKeys.issue(projectKey!, issue.number), queryFn: () => issueApi.get(projectKey!, issue.number) })
      openIssue(issue)
    },
  })

  const persistOrder = (next: ColKey[]) => {
    setOrder(next)
    try { localStorage.setItem(ORDER_KEY, JSON.stringify(next)) } catch { /* ignore */ }
  }
  const persistWidths = (next: Record<ColKey, number>) => {
    setWidths(next)
    try { localStorage.setItem(WIDTHS_KEY, JSON.stringify(next)) } catch { /* ignore */ }
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const onHeaderDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIdx = order.indexOf(active.id as ColKey)
    const newIdx = order.indexOf(over.id as ColKey)
    if (oldIdx < 0 || newIdx < 0) return
    const next = [...order]
    const [moved] = next.splice(oldIdx, 1)
    next.splice(newIdx, 0, moved)
    persistOrder(next)
  }

  const toggleHidden = (k: ColKey) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(k)) {
        next.delete(k)
        if (!order.includes(k)) persistOrder([...order, k])
      } else {
        next.add(k)
        persistOrder(order.filter((x) => x !== k))
      }
      return next
    })
  }

  const resetCols = () => {
    persistOrder(DEFAULT_ORDER)
    persistWidths(DEFAULT_WIDTHS)
    setHidden(new Set())
  }

  const showCol = (k: ColKey) => !hidden.has(k)

  if (isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-2 border-b px-4 py-2.5">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Issue list</h2>
          <span className="text-xs text-muted-foreground">{sorted.length} issues</span>
          <div className="ml-auto flex items-center gap-1">
            {Object.entries(COMMON_TQ_FILTERS).map(([id, f]) => (
              <button
                key={id}
                onClick={() => setCommonFilter(commonFilter === id ? null : id)}
                title={f.query}
                className={cn(
                  'press-pulse rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                  commonFilter === id ? 'border-primary/40 bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                {f.label}
              </button>
            ))}
            <ColumnsMenu hidden={hidden} onToggle={toggleHidden} onReset={resetCols} allKeys={allKeys} />
          </div>
        </div>
        <TrazeFilterBar issues={serverIssues ?? []} criteria={criteria} onChange={setCriteria} />
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onHeaderDragEnd}>
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="min-w-max">
            <div className="sticky top-0 z-10 border-b bg-card/95 backdrop-blur">
              <SortableContext items={cols.map((c) => c.key)} strategy={horizontalListSortingStrategy}>
                <div className="flex items-stretch">
                  {cols.map((c) => (
                    <HeaderCell key={c.key} col={c} width={widths[c.key]} onResize={(w) => persistWidths({ ...widths, [c.key]: w })} />
                  ))}
                </div>
              </SortableContext>
            </div>
            {sorted.length === 0 ? (
              <p className="px-6 py-12 text-center text-sm text-muted-foreground">No issues match these filters.</p>
            ) : (
              <ul>
                {sorted.map((issue, idx) => {
                  const isSelected = selectedIndex === idx
                  return (
                    <li key={issue.id} className="row-enter" style={{ animationDelay: `${Math.min(idx * 12, 240)}ms` }}>
                      {idx > 0 && <hr className="mx-3 border-t border-border/40" />}
                      <div
                        ref={setItemRef(idx)}
                        onClick={() => openIssue(issue)}
                        className={cn(
                          'flex w-full cursor-pointer items-center gap-3 px-3 py-1.5 text-left transition-colors hover:bg-accent/40',
                          isSelected && 'bg-accent/60',
                        )}
                      >
                        {showCol('key') && <span style={{ width: widths.key }} className="shrink-0 font-mono text-[11px] text-muted-foreground">{issue.key}</span>}
                        {showCol('title') && <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{issue.title}</span>}
                        {showCol('type') && <div style={{ width: widths.type }} className="shrink-0"><TypeBadge type={issue.type} /></div>}
                        {showCol('status') && <div style={{ width: widths.status }} className="shrink-0"><StatusBadge status={issue.status} /></div>}
                        {showCol('priority') && <div style={{ width: widths.priority }} className="shrink-0"><PriorityIcon priority={issue.priority} /></div>}
                        {showCol('assignee') && <div style={{ width: widths.assignee }} className="shrink-0">{issue.assignee ? <IssueAvatar issue={issue} /> : <span className="text-muted-foreground/40">—</span>}</div>}
                        {showCol('estimate') && <span style={{ width: widths.estimate }} className="shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{issue.estimate ?? ''}</span>}
                        {showCol('sprint') && <span style={{ width: widths.sprint }} className="shrink-0 truncate text-[11px] text-muted-foreground">{issue.sprintName ?? '—'}</span>}
                        {showCol('epic') && <span style={{ width: widths.epic }} className="shrink-0 truncate text-[11px] text-muted-foreground">{issue.epicName ? `◈ ${issue.epicName}` : ''}</span>}
                        {showCol('labels') && (
                          <div style={{ width: widths.labels }} className="flex shrink-0 gap-1 overflow-hidden">
                            {issue.labels.slice(0, 2).map((l) => <LabelChip key={l.id} name={l.name} color={l.color} />)}
                            {issue.labels.length > 2 && <span className="text-[10px] text-muted-foreground">+{issue.labels.length - 2}</span>}
                          </div>
                        )}
                        {showCol('created') && <span style={{ width: widths.created }} className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(issue.createdAt)}</span>}
                        {showCol('updated') && <span style={{ width: widths.updated }} className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(issue.updatedAt)}</span>}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </DndContext>

      <IssuePanel />
    </div>
  )
}

function HeaderCell({ col, width, onResize }: { col: ColDef; width: number; onResize: (w: number) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: col.key })
  const startX = useRef(0)
  const startW = useRef(0)
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    startX.current = e.clientX
    startW.current = width
    const onMove = (ev: MouseEvent) => {
      const w = Math.max(col.minWidth, startW.current + (ev.clientX - startX.current))
      onResize(w)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        width: col.key === 'title' ? undefined : width,
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className={cn(
        'relative flex shrink-0 items-center gap-1 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground',
        col.key === 'title' && 'flex-1 min-w-0',
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="press-pulse flex shrink-0 cursor-grab items-center gap-1 rounded p-0.5 hover:bg-accent/40 active:cursor-grabbing"
        title="Drag to reorder"
      >
        <GripVertical className="size-3" />
      </button>
      <span className="truncate">{col.label}</span>
      {col.key !== 'title' && (
        <div
          onMouseDown={onMouseDown}
          className="absolute -right-0.5 top-0 z-10 h-full w-1.5 cursor-col-resize transition-colors hover:bg-primary/40"
          title="Drag to resize"
        />
      )}
    </div>
  )
}

function ColumnsMenu({
  hidden,
  onToggle,
  onReset,
  allKeys,
}: {
  hidden: Set<ColKey>
  onToggle: (k: ColKey) => void
  onReset: () => void
  allKeys: Set<ColKey>
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="press-pulse flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground" title="Columns">
          <Columns3 className="size-3.5" /> Columns
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 p-2">
        <div className="flex items-center justify-between px-2 pb-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Columns</p>
          <button onClick={onReset} className="text-[10px] text-muted-foreground hover:text-foreground">Reset</button>
        </div>
        {ALL_COLUMNS.map((c) => {
          const on = !hidden.has(c.key) && allKeys.has(c.key)
          return (
            <button
              key={c.key}
              onClick={() => onToggle(c.key)}
              className={cn(
                'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                on ? 'bg-primary/15 text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <span>{c.label}</span>
              <span className="text-[10px] uppercase tracking-wider opacity-60">{on ? 'on' : 'off'}</span>
            </button>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}
