import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DndContext, PointerSensor, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus } from 'lucide-react'
import { filterApi, issueApi, searchApi, sprintApi, STATUSES, type Issue, type Sprint, type Status } from '../lib/api'
import { queryKeys } from '../lib/query-keys'
import { cn } from '../lib/utils'
import { useListNav } from '../lib/use-list-nav'
import { useAuth } from '../lib/auth'
import { IssueAvatar, LabelChip, PriorityIcon, TypeBadge, STATUS_META } from '../components/issues/meta'
import { IssuePanel } from '../components/issues/issue-panel'
import { CreateIssueDialog } from '../components/issues/create-issue-dialog'
import { ColumnToggles } from '../components/traze/column-toggles'
import { TrazeFilterBar } from '../components/traze/filter-bar'
import { COMMON_TQ_FILTERS, criteriaToTq, emptyCriteria, type TrazeCriteria } from '../lib/traze'

type ViewMode = 'status' | 'sprint'

export function BoardPage() {
  const { projectKey } = useParams<{ projectKey: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const [viewMode, setViewMode] = useState<ViewMode>('status')
  const [activeFilter, setActiveFilter] = useState<string | null>(null)
  const [commonFilter, setCommonFilter] = useState<string | null>(null)
  const [criteria, setCriteria] = useState<TrazeCriteria>(emptyCriteria)
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => new Set())

  const { data: savedFilters } = useQuery({ queryKey: queryKeys.filters, queryFn: filterApi.list })
  const { data: sprints } = useQuery({ queryKey: queryKeys.sprints(projectKey!), queryFn: () => sprintApi.list(projectKey!) })

  const saved = savedFilters?.find((f) => f.id === activeFilter) ?? null
  const commonTq = commonFilter ? COMMON_TQ_FILTERS[commonFilter]?.query ?? null : null

  const criteriaTq = useMemo(() => criteriaToTq(criteria, projectKey!), [criteria, projectKey])
  const filterQuery = useMemo(() => {
    const parts = [criteriaTq]
    if (commonTq) parts.push(commonTq)
    if (saved) parts.push(`(${saved.query})`)
    const all = parts.join(' AND ')
    if (all === `project = ${projectKey}`) return null
    return all
  }, [saved, commonTq, criteriaTq, projectKey])

  const issueQueryKey = filterQuery ? queryKeys.search(filterQuery) : queryKeys.issues(projectKey!)

  const { data: issues, isPending } = useQuery({
    queryKey: issueQueryKey,
    queryFn: filterQuery ? () => searchApi.query(filterQuery) : () => issueApi.list(projectKey!),
  })

  const mineFiltered = useMemo(
    () => (activeFilter === 'mine' ? (issues ?? []).filter((i) => i.assigneeId === user?.id) : issues ?? []),
    [issues, activeFilter, user],
  )

  const sortedSprints = useMemo(() => {
    return [...(sprints ?? [])].sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
      const ad = a.startDate ? new Date(a.startDate).getTime() : 0
      const bd = b.startDate ? new Date(b.startDate).getTime() : 0
      return bd - ad
    })
  }, [sprints])

  const visible = useMemo(() => {
    const sorted = [...mineFiltered].sort((a, b) => a.position - b.position)
    return sorted.filter((i) => !hiddenColumns.has(columnKey(i, viewMode, sortedSprints)))
  }, [mineFiltered, hiddenColumns, viewMode, sortedSprints])

  const columnCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const i of mineFiltered) {
      const k = columnKey(i, viewMode, sortedSprints)
      counts[k] = (counts[k] ?? 0) + 1
    }
    return counts
  }, [mineFiltered, viewMode, sortedSprints])

  const columns = useMemo(() => {
    const sorted = [...visible].sort((a, b) => a.position - b.position)
    if (viewMode === 'status') {
      return STATUSES.filter((s) => !hiddenColumns.has(s)).map((status) => ({
        key: status,
        title: STATUS_META[status].label,
        dot: STATUS_META[status].dot,
        issues: sorted.filter((i) => i.status === status),
        target: { type: 'status' as const, value: status },
      }))
    }
    const result: { key: string; title: string; dot: string; issues: Issue[]; target: { type: 'sprint'; value: string | null } }[] = []
    if (!hiddenColumns.has('backlog')) {
      result.push({
        key: 'backlog',
        title: 'Backlog',
        dot: 'bg-muted-foreground/40',
        issues: sorted.filter((i) => i.sprintId == null),
        target: { type: 'sprint', value: null },
      })
    }
    for (const s of sortedSprints) {
      if (hiddenColumns.has(s.id)) continue
      result.push({
        key: s.id,
        title: s.name + (s.isActive ? ' · active' : ''),
        dot: s.isActive ? 'bg-emerald-500' : 'bg-muted-foreground/40',
        issues: sorted.filter((i) => i.sprintId === s.id),
        target: { type: 'sprint', value: s.id },
      })
    }
    return result
  }, [visible, hiddenColumns, viewMode, sortedSprints])

  const openIssue = (issue: Issue) => {
    const next = new URLSearchParams(searchParams)
    next.set('issue', issue.key)
    setSearchParams(next)
  }

  const { selectedIndex, setItemRef } = useListNav({
    items: visible,
    onOpen: openIssue,
  })

  const [newFor, setNewFor] = useState<{ type: ViewMode; value: string | null } | null>(null)
  const createDefaults = newFor
    ? newFor.type === 'status'
      ? (newFor.value as Status)
      : 'ToDo'
    : searchParams.get('new') === '1'
      ? 'ToDo'
      : null

  const move = useMutation({
    mutationFn: ({ id, target, position }: { id: string; target: { type: 'status'; value: Status } | { type: 'sprint'; value: string | null }; position: number }) => {
      const issue = issues?.find((i) => i.id === id)
      const data: Record<string, unknown> = { position }
      if (target.type === 'status') data.status = target.value
      else data.sprintId = target.value
      return issueApi.update(projectKey!, issue!.number, data)
    },
    onMutate: ({ id, target, position }) => {
      if (filterQuery) return
      void queryClient.cancelQueries({ queryKey: issueQueryKey })
      const previous = queryClient.getQueryData<Issue[]>(issueQueryKey)
      queryClient.setQueryData<Issue[]>(issueQueryKey, (old) => {
        if (!old) return old
        const issue = old.find((i) => i.id === id)
        if (!issue) return old
        const updated = { ...issue }
        if (target.type === 'status') updated.status = target.value
        else updated.sprintId = target.value
        const others = old.filter((i) => i.id !== id)
        const targetKey = target.type === 'status' ? (i: Issue) => i.status === target.value : (i: Issue) => i.sprintId === target.value
        const inTarget = others.filter(targetKey).sort((a, b) => a.position - b.position)
        const insertAt = Math.min(Math.max(position, 0), inTarget.length)
        inTarget.splice(insertAt, 0, { ...updated, position: insertAt })
        const renumbered = inTarget.map((i, idx) => ({ ...i, position: idx }))
        const rest = others.filter((i) => !targetKey(i))
        return [...rest, ...renumbered]
      })
      return { previous }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(issueQueryKey, ctx.previous)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.issues(projectKey!) })
      void queryClient.invalidateQueries({ queryKey: ['search'] })
    },
  })

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return
    const fromId = String(active.id)
    const overId = String(over.id)
    const issue = issues?.find((i) => i.id === fromId)
    if (!issue) return

    if (overId.startsWith('column:status:')) {
      const status = overId.slice(14) as Status
      const target = (issues ?? []).filter((i) => i.status === status).length
      move.mutate({ id: fromId, target: { type: 'status', value: status }, position: target })
      return
    }
    if (overId.startsWith('column:sprint:')) {
      const sprintId = overId.slice(14) === 'null' ? null : overId.slice(14)
      const target = (issues ?? []).filter((i) => i.sprintId === sprintId).length
      move.mutate({ id: fromId, target: { type: 'sprint', value: sprintId }, position: target })
      return
    }

    const overIssue = issues?.find((i) => i.id === overId)
    if (!overIssue) return
    if (overIssue.id === issue.id) return
    if (issue.status === overIssue.status && issue.sprintId === overIssue.sprintId) {
      const target = (issues ?? []).filter((i) => i.status === overIssue.status).sort((a, b) => a.position - b.position)
      const insertAt = target.findIndex((i) => i.id === overId)
      move.mutate({ id: fromId, target: { type: 'status', value: overIssue.status }, position: insertAt === -1 ? target.length : insertAt })
    }
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const toggleColumn = (key: string) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (isPending) return <div className="p-8 text-sm text-muted-foreground">Loading board…</div>

  const viewToggle = (
    <div className="flex items-center gap-1 rounded-md border bg-secondary/40 p-0.5 text-xs">
      {(['status', 'sprint'] as ViewMode[]).map((m) => (
        <button
          key={m}
          onClick={() => setViewMode(m)}
          className={cn(
            'rounded px-2.5 py-1 font-medium transition-colors',
            viewMode === m ? 'bg-accent text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          By {m}
        </button>
      ))}
    </div>
  )

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-2 border-b px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {viewToggle}
          <div className="mx-1 h-5 w-px bg-border" />
          <QuickFilterChip active={activeFilter === 'mine'} onClick={() => setActiveFilter(activeFilter === 'mine' ? null : 'mine')}>
            Only my issues
          </QuickFilterChip>
          {Object.entries(COMMON_TQ_FILTERS).map(([id, f]) => (
            <QuickFilterChip key={id} active={commonFilter === id} title={f.query} onClick={() => setCommonFilter(commonFilter === id ? null : id)}>
              {f.label}
            </QuickFilterChip>
          ))}
          {savedFilters?.map((f) => (
            <QuickFilterChip key={f.id} active={activeFilter === f.id} title={f.query} onClick={() => setActiveFilter(activeFilter === f.id ? null : f.id)}>
              {f.name}
            </QuickFilterChip>
          ))}
        </div>

        <ColumnToggles
          hidden={hiddenColumns}
          onToggle={toggleColumn}
          counts={columnCounts}
          columns={viewMode === 'status' ? STATUSES.map((s) => ({ key: s, label: STATUS_META[s].label, dot: STATUS_META[s].dot })) : [{ key: 'backlog', label: 'Backlog', dot: 'bg-muted-foreground/40' }, ...sortedSprints.map((s) => ({ key: s.id, label: s.name, dot: s.isActive ? 'bg-emerald-500' : 'bg-muted-foreground/40' }))]}
        />
        <TrazeFilterBar issues={mineFiltered} criteria={criteria} onChange={setCriteria} />
      </div>

      <div className="flex flex-1 gap-3 overflow-x-auto p-4">
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          {columns.map((col) => (
            <BoardColumn
              key={col.key}
              columnKey={col.key}
              title={col.title}
              dot={col.dot}
              issues={col.issues}
              visible={visible}
              target={col.target}
              viewMode={viewMode}
              selectedIndex={selectedIndex}
              setItemRef={setItemRef}
              onCreate={() => {
                if (col.target.type === 'status') setNewFor({ type: 'status', value: col.target.value })
                else setNewFor({ type: 'sprint', value: col.target.value })
              }}
            />
          ))}
        </DndContext>
      </div>

      <CreateIssueDialog
        open={!!createDefaults}
        defaults={createDefaults ? { status: createDefaults } : undefined}
        onOpenChange={(open) => {
          if (!open) {
            setNewFor(null)
            if (searchParams.get('new')) {
              const next = new URLSearchParams(searchParams)
              next.delete('new')
              setSearchParams(next, { replace: true })
            }
          }
        }}
      />
      <IssuePanel />
    </div>
  )
}

function columnKey(issue: Issue, view: ViewMode, sprints: Sprint[]): string {
  if (view === 'status') return issue.status
  if (issue.sprintId == null) return 'backlog'
  return issue.sprintId
}

function QuickFilterChip({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean
  onClick: () => void
  title?: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-primary/40 bg-primary/10 text-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function BoardColumn({
  columnKey: key,
  title,
  dot,
  issues,
  visible,
  target,
  viewMode,
  selectedIndex,
  setItemRef,
  onCreate,
}: {
  columnKey: string
  title: string
  dot: string
  issues: Issue[]
  visible: Issue[]
  target: { type: 'status'; value: Status } | { type: 'sprint'; value: string | null }
  viewMode: ViewMode
  selectedIndex: number
  setItemRef: (index: number) => (el: HTMLElement | null) => void
  onCreate: () => void
}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const droppableId = target.type === 'status' ? `column:status:${target.value}` : `column:sprint:${target.value ?? 'null'}`
  const { setNodeRef, isOver } = useDroppable({ id: droppableId })

  const openIssue = (issue: Issue) => {
    const next = new URLSearchParams(searchParams)
    next.set('issue', issue.key)
    setSearchParams(next)
  }

  const firstVisible = visible.findIndex((i) =>
    target.type === 'status' ? i.status === target.value : i.sprintId === target.value,
  )

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex w-72 shrink-0 flex-col rounded-lg border bg-muted/30',
        isOver && 'ring-2 ring-primary/40',
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className={cn('size-2 rounded-full', dot)} />
        <span className="truncate text-xs font-semibold uppercase tracking-wide">{title}</span>
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">{issues.length}</span>
        <button onClick={onCreate} className="ml-auto rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" title={`Add to ${title}`}>
          <Plus className="size-3.5" />
        </button>
      </div>
      <SortableContext items={issues.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
          {issues.map((issue) => (
            <IssueCard
              key={issue.id}
              issue={issue}
              selected={selectedIndex === firstVisible + issues.indexOf(issue)}
              itemRef={setItemRef(firstVisible + issues.indexOf(issue))}
              onOpen={() => openIssue(issue)}
            />
          ))}
          {issues.length === 0 && (
            <div className="flex h-20 items-center justify-center rounded-md border border-dashed text-[11px] text-muted-foreground">
              Drop issues here
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  )
}

function IssueCard({
  issue,
  selected,
  itemRef,
  onOpen,
}: {
  issue: Issue
  selected: boolean
  itemRef: (el: HTMLElement | null) => void
  onOpen: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: issue.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={(el) => {
        setNodeRef(el)
        itemRef(el)
      }}
      style={style}
      onClick={onOpen}
      className={cn(
        'group cursor-pointer rounded-md border bg-card p-2.5 shadow-sm transition-shadow hover:shadow',
        isDragging && 'z-10 opacity-60 shadow-lg',
        selected && 'ring-2 ring-primary/60',
      )}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="font-mono text-[11px] text-muted-foreground">{issue.key}</span>
        <TypeBadge type={issue.type} />
        <span className="ml-auto flex items-center gap-1.5">
          <PriorityIcon priority={issue.priority} />
          <button
            className="cursor-grab rounded p-0.5 text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground active:cursor-grabbing"
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            title="Drag to move"
          >
            <GripVertical className="size-3.5" />
          </button>
        </span>
      </div>
      <p className="text-[13px] font-medium leading-snug">{issue.title}</p>
      {issue.epicName && <p className="mt-1 text-[11px] text-muted-foreground">◈ {issue.epicName}</p>}
      {issue.labels.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {issue.labels.map((l) => (
            <LabelChip key={l.id} name={l.name} color={l.color} />
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">{issue.estimate != null ? `${issue.estimate} pts` : ''}</span>
        <IssueAvatar issue={issue} />
      </div>
    </div>
  )
}
