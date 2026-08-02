import { useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DndContext, PointerSensor, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus } from 'lucide-react'
import { issueApi, STATUSES, type Issue, type Status } from '../lib/api'
import { queryKeys } from '../lib/query-keys'
import { cn } from '../lib/utils'
import { IssueAvatar, LabelChip, PriorityIcon, TypeBadge, STATUS_META } from '../components/issues/meta'
import { IssuePanel } from '../components/issues/issue-panel'
import { CreateIssueDialog } from '../components/issues/create-issue-dialog'

export function BoardPage() {
  const { projectKey } = useParams<{ projectKey: string }>()
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()

  const { data: issues, isPending } = useQuery({
    queryKey: queryKeys.issues(projectKey!),
    queryFn: () => issueApi.list(projectKey!),
  })

  const [newFor, setNewFor] = useState<Status | null>(null)
  const createDefaults = newFor ?? (searchParams.get('new') === '1' ? ('ToDo' as Status) : null)

  const move = useMutation({
    mutationFn: ({ id, status, position }: { id: string; status: Status; position: number }) => {
      const issue = issues?.find((i) => i.id === id)
      return issueApi.update(projectKey!, issue!.number, { status, position })
    },
    onMutate: ({ id, status, position }) => {
      const key = queryKeys.issues(projectKey!)
      void queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<Issue[]>(key)
      queryClient.setQueryData<Issue[]>(key, (old) => {
        if (!old) return old
        const issue = old.find((i) => i.id === id)
        if (!issue) return old
        const others = old.filter((i) => i.id !== id)
        const target = others.filter((i) => i.status === status).sort((a, b) => a.position - b.position)
        const insertAt = Math.min(Math.max(position, 0), target.length)
        target.splice(insertAt, 0, { ...issue, status, position: insertAt })
        const renumbered = target.map((i, idx) => ({ ...i, position: idx }))
        const rest = others.filter((i) => i.status !== status)
        return [...rest, ...renumbered]
      })
      return { previous }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(queryKeys.issues(projectKey!), ctx.previous)
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.issues(projectKey!) }),
  })

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return
    const fromId = String(active.id)
    const overId = String(over.id)
    const issue = issues?.find((i) => i.id === fromId)
    if (!issue) return

    if (overId.startsWith('column:')) {
      const status = overId.slice(7) as Status
      const target = (issues ?? []).filter((i) => i.status === status).length
      move.mutate({ id: fromId, status, position: target })
      return
    }

    const overIssue = issues?.find((i) => i.id === overId)
    if (!overIssue) return
    const target = (issues ?? [])
      .filter((i) => i.status === overIssue.status)
      .sort((a, b) => a.position - b.position)
    const insertAt = target.findIndex((i) => i.id === overId)
    move.mutate({ id: fromId, status: overIssue.status, position: insertAt === -1 ? target.length : insertAt })
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const columns = useMemo(() => {
    const sorted = [...(issues ?? [])].sort((a, b) => a.position - b.position)
    return STATUSES.map((status) => ({
      status,
      issues: sorted.filter((i) => i.status === status),
    }))
  }, [issues])

  if (isPending) return <div className="p-8 text-sm text-muted-foreground">Loading board…</div>

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 gap-3 overflow-x-auto p-4">
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          {columns.map(({ status, issues: columnIssues }) => (
            <BoardColumn
              key={status}
              status={status}
              issues={columnIssues}
              onCreate={() => setNewFor(status)}
            />
          ))}
        </DndContext>
      </div>

      <CreateIssueDialog
        open={!!createDefaults}
        defaults={createDefaults ? { status: createDefaults } : undefined}
        onOpenChange={(open) => {
          if (!open) setNewFor(null)
        }}
      />
      <IssuePanel />
    </div>
  )
}

function BoardColumn({ status, issues, onCreate }: { status: Status; issues: Issue[]; onCreate: () => void }) {
  const meta = STATUS_META[status]
  const [searchParams, setSearchParams] = useSearchParams()
  const { setNodeRef, isOver } = useDroppable({ id: `column:${status}` })

  const openIssue = (issue: Issue) => {
    const next = new URLSearchParams(searchParams)
    next.set('issue', issue.key)
    setSearchParams(next)
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex w-72 shrink-0 flex-col rounded-lg border bg-muted/30',
        isOver && 'ring-2 ring-primary/40',
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className={cn('size-2 rounded-full', meta.dot)} />
        <span className="text-xs font-semibold uppercase tracking-wide">{meta.label}</span>
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">{issues.length}</span>
        <button onClick={onCreate} className="ml-auto rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" title={`Add to ${meta.label}`}>
          <Plus className="size-3.5" />
        </button>
      </div>
      <SortableContext items={issues.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
          {issues.map((issue) => (
            <IssueCard key={issue.id} issue={issue} onOpen={() => openIssue(issue)} />
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

function IssueCard({ issue, onOpen }: { issue: Issue; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: issue.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onOpen}
      className={cn(
        'group cursor-pointer rounded-md border bg-card p-2.5 shadow-sm transition-shadow hover:shadow',
        isDragging && 'z-10 opacity-60 shadow-lg',
      )}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="font-mono text-[11px] text-muted-foreground">{issue.key}</span>
        <TypeBadge type={issue.type} />
        <span className="ml-auto flex items-center gap-1.5">
          <PriorityIcon priority={issue.priority} />
          <button
            className="cursor-grab text-muted-foreground/0 transition-colors group-hover:text-muted-foreground active:cursor-grabbing"
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
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
