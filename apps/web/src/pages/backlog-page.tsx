import { useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { useSortable, SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Calendar, Columns3, GripVertical, Inbox } from 'lucide-react'
import { issueApi, searchApi, sprintApi, timeAgo, type Issue, type Sprint } from '../lib/api'
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
  const { data: sprints } = useQuery({ queryKey: queryKeys.sprints(projectKey!), queryFn: () => sprintApi.list(projectKey!) })

  const assign = useMutation({
    mutationFn: ({ issueNumber, sprintId }: { issueNumber: number; sprintId: string | null }) =>
      issueApi.update(projectKey!, issueNumber, { sprintId }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.issues(projectKey!) }),
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
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const activeId = String(active.id)
    const overId = String(over.id)

    // Column reorder: id is a ColKey (e.g. "key", "title")
    if (order.includes(activeId as ColKey) && order.includes(overId as ColKey)) {
      const oldIdx = order.indexOf(activeId as ColKey)
      const newIdx = order.indexOf(overId as ColKey)
      if (oldIdx < 0 || newIdx < 0) return
      const next = [...order]
      const [moved] = next.splice(oldIdx, 1)
      next.splice(newIdx, 0, moved)
      persistOrder(next)
      return
    }

    // Sprint assign: droppable id is "sprint:<id|null>"
    if (overId.startsWith('sprint:')) {
      const sprintId = overId.slice('sprint:'.length) || null
      const issueId = activeId.startsWith('issue:') ? activeId.slice('issue:'.length) : null
      if (!issueId) return
      const issue = sorted.find((i) => i.id === issueId)
      if (!issue || issue.sprintId === sprintId) return
      assign.mutate({ issueNumber: issue.number, sprintId: sprintId ?? null })
    }
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
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex flex-col gap-2 border-b border-border/60 px-5 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold tracking-tight">Issue list</h2>
            <span className="text-xs text-muted-foreground">Loading…</span>
          </div>
        </div>
        <div className="flex min-h-0 flex-1">
          <div className="min-h-0 flex-1 overflow-hidden p-2">
            <div className="space-y-0.5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-md px-3 py-2">
                  <div className="skeleton h-3.5 w-16" />
                  <div className="skeleton h-3.5 flex-1" style={{ maxWidth: `${60 - i * 3}%` }} />
                  <div className="skeleton h-4 w-16" />
                  <div className="skeleton h-4 w-20" />
                  <div className="skeleton size-5 rounded-full" />
                </div>
              ))}
            </div>
          </div>
          <SprintPanelSkeleton />
        </div>
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

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="min-w-0 flex-1 overflow-auto">
            <div className="min-w-max">
              <div className="sticky top-0 z-10 border-b border-border/60 bg-background/85 backdrop-blur-md">
                <SortableContext items={cols.map((c) => c.key)} strategy={horizontalListSortingStrategy}>
                  <div className="flex items-stretch">
                    {cols.map((c) => (
                      <HeaderCell key={c.key} col={c} width={widths[c.key]} onResize={(w) => persistWidths({ ...widths, [c.key]: w })} />
                    ))}
                  </div>
                </SortableContext>
              </div>
            {sorted.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
                <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-muted">
                  <Inbox className="size-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">No issues match</p>
                <p className="mt-1 text-xs text-muted-foreground">Try removing some filters or check your TQ query.</p>
              </div>
            ) : (
              <ul role="list" className="px-1.5 py-1.5">
                {sorted.map((issue, idx) => (
                  <DraggableIssueRow
                    key={issue.id}
                    issue={issue}
                    idx={idx}
                    isSelected={selectedIndex === idx}
                    showCol={showCol}
                    widths={widths}
                    setItemRef={setItemRef}
                    openIssue={openIssue}
                  />
                ))}
              </ul>
            )}
            </div>
          </div>
          <SprintPanel sprints={sprints ?? []} issues={sorted} />
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
        'group/head relative flex h-8 shrink-0 items-center gap-1 px-3 text-[10.5px] font-medium uppercase tracking-[0.04em] text-muted-foreground/80',
        col.key === 'title' && 'flex-1 min-w-0',
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="press-pulse flex shrink-0 cursor-grab items-center gap-1 rounded p-0.5 opacity-0 transition-opacity hover:bg-accent/40 active:cursor-grabbing group-hover/head:opacity-100"
        title="Drag to reorder"
      >
        <GripVertical className="size-3" />
      </button>
      <span className="truncate">{col.label}</span>
      {col.key !== 'title' && (
        <div
          onMouseDown={onMouseDown}
          className="absolute -right-0.5 top-0 z-10 h-full w-1.5 cursor-col-resize transition-colors hover:bg-primary/30"
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

function DraggableIssueRow({
  issue,
  idx,
  isSelected,
  showCol,
  widths,
  setItemRef,
  openIssue,
}: {
  issue: Issue
  idx: number
  isSelected: boolean
  showCol: (k: ColKey) => boolean
  widths: Record<ColKey, number>
  setItemRef: (index: number) => (el: HTMLElement | null) => void
  openIssue: (issue: Issue) => void
}) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id: `issue:${issue.id}` })
  return (
    <li className="row-enter" style={{ animationDelay: `${Math.min(idx * 12, 200)}ms`, opacity: isDragging ? 0.4 : undefined }}>
      <div
        ref={setItemRef(idx)}
        onClick={() => openIssue(issue)}
        data-selected={isSelected}
        className={cn(
          'group relative flex h-9 w-full cursor-pointer items-center gap-3 rounded-md px-3 text-left transition-colors duration-100',
          isSelected ? 'bg-primary/8' : 'hover:bg-accent/40',
        )}
      >
        {isSelected && <div className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-primary" aria-hidden />}
        <button
          ref={setDragRef as unknown as React.Ref<HTMLButtonElement>}
          {...listeners}
          {...attributes}
          onClick={(e) => e.stopPropagation()}
          className="press-pulse -ml-1 flex h-5 w-3 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground/0 transition-colors hover:bg-accent group-hover:text-muted-foreground/60 active:cursor-grabbing"
          title="Drag to assign to a sprint"
        >
          <GripVertical className="size-3" />
        </button>
        {showCol('key') && <span style={{ width: widths.key }} className="shrink-0 font-mono text-[11.5px] tracking-tight text-muted-foreground">{issue.key}</span>}
        {showCol('title') && <span className="min-w-0 flex-1 truncate text-[13px] font-medium leading-tight">{issue.title}</span>}
        {showCol('type') && <div style={{ width: widths.type }} className="shrink-0"><TypeBadge type={issue.type} /></div>}
        {showCol('status') && <div style={{ width: widths.status }} className="shrink-0"><StatusBadge status={issue.status} /></div>}
        {showCol('priority') && <div style={{ width: widths.priority }} className="shrink-0"><PriorityIcon priority={issue.priority} /></div>}
        {showCol('assignee') && <div style={{ width: widths.assignee }} className="shrink-0">{issue.assignee ? <IssueAvatar issue={issue} /> : <span className="text-muted-foreground/40">—</span>}</div>}
        {showCol('estimate') && <span style={{ width: widths.estimate }} className="shrink-0 text-right text-[11.5px] tabular-nums text-muted-foreground">{issue.estimate ?? ''}</span>}
        {showCol('sprint') && <span style={{ width: widths.sprint }} className="shrink-0 truncate text-[11.5px] text-muted-foreground">{issue.sprintName ?? '—'}</span>}
        {showCol('epic') && <span style={{ width: widths.epic }} className="shrink-0 truncate text-[11.5px] text-muted-foreground">{issue.epicName ? `◈ ${issue.epicName}` : ''}</span>}
        {showCol('labels') && (
          <div style={{ width: widths.labels }} className="flex shrink-0 gap-1 overflow-hidden">
            {issue.labels.slice(0, 2).map((l) => <LabelChip key={l.id} name={l.name} color={l.color} />)}
            {issue.labels.length > 2 && <span className="text-[10px] text-muted-foreground">+{issue.labels.length - 2}</span>}
          </div>
        )}
        {showCol('created') && <span style={{ width: widths.created }} className="shrink-0 text-[11.5px] text-muted-foreground tabular-nums">{timeAgo(issue.createdAt)}</span>}
        {showCol('updated') && <span style={{ width: widths.updated }} className="shrink-0 text-[11.5px] text-muted-foreground tabular-nums">{timeAgo(issue.updatedAt)}</span>}
      </div>
    </li>
  )
}

function SprintPanel({ sprints, issues }: { sprints: Sprint[]; issues: Issue[] }) {
  const sortedSprints = useMemo(
    () => [...sprints].sort((a, b) => (a.isActive ? -1 : b.isActive ? 1 : a.name.localeCompare(b.name))),
    [sprints],
  )
  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-l border-border/60 bg-card/30">
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
        <Calendar className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold tracking-tight">Sprints</h2>
        <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">{sprints.length}</span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        <BacklogDropZone issues={issues.filter((i) => i.sprintId == null)} />
        {sortedSprints.map((s) => (
          <SprintCard key={s.id} sprint={s} issues={issues.filter((i) => i.sprintId === s.id)} />
        ))}
      </div>
    </aside>
  )
}

function SprintCard({ sprint, issues }: { sprint: Sprint; issues: Issue[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: `sprint:${sprint.id}` })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-md border bg-card/50 p-2 transition-colors',
        isOver && 'border-primary bg-primary/5',
      )}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className={cn('size-1.5 rounded-full', sprint.isActive ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
        <span className="truncate text-[12px] font-semibold">{sprint.name}</span>
        {sprint.isActive && <span className="rounded-full bg-emerald-500/15 px-1.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Active</span>}
        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">{issues.length}</span>
      </div>
      {sprint.goal && <p className="mb-1.5 truncate text-[10px] text-muted-foreground">{sprint.goal}</p>}
      <ul className="space-y-0.5">
        {issues.slice(0, 5).map((i) => (
          <li key={i.id} className="truncate text-[11px] text-muted-foreground">
            <span className="font-mono">{i.key}</span> <span className="text-foreground/70">{i.title}</span>
          </li>
        ))}
        {issues.length > 5 && <li className="text-[10px] text-muted-foreground/60">+{issues.length - 5} more</li>}
        {issues.length === 0 && <li className="text-[10px] italic text-muted-foreground/60">Drop issues here</li>}
      </ul>
    </div>
  )
}

function SprintPanelSkeleton() {
  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-l border-border/60 bg-card/30">
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
        <Calendar className="size-4 text-muted-foreground" />
        <div className="skeleton h-3.5 w-16" />
      </div>
      <div className="space-y-2 p-3">
        {[60, 80, 40].map((w, i) => (
          <div key={i} className="rounded-md border bg-card/50 p-2">
            <div className="skeleton mb-1.5 h-3" style={{ width: `${w}%` }} />
            <div className="skeleton h-2.5 w-3/4" />
          </div>
        ))}
      </div>
    </aside>
  )
}

function BacklogDropZone({ issues }: { issues: Issue[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'sprint:' })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-md border border-dashed p-2 transition-colors',
        isOver ? 'border-primary bg-primary/5' : 'border-border/60',
      )}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <Inbox className="size-3 text-muted-foreground" />
        <span className="text-[11px] font-medium text-muted-foreground">Backlog (unassigned)</span>
        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">{issues.length}</span>
      </div>
      <p className="text-[10px] italic text-muted-foreground/60">Drop issues here to unschedule</p>
    </div>
  )
}
