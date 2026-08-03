import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Calendar,
  Check,
  ChevronDown,
  Clock,
  Flag,
  History,
  Loader2,
  MessageSquare,
  Paperclip,
  PaperclipIcon,
  Plus,
  Save,
  Trash2,
  X,
  Zap,
} from 'lucide-react'
import {
  PRIORITIES,
  STATUSES,
  authApi,
  epicApi,
  issueApi,
  labelApi,
  releaseApi,
  sprintApi,
  timeAgo,
  type HistoryEntry,
  type Issue,
  type Priority,
  type Status,
} from '../../lib/api'
import { queryKeys } from '../../lib/query-keys'
import { Button } from '../ui/button'
import { Sheet, SheetContent } from '../ui/sheet'
import { Textarea } from '../ui/textarea'
import { Input } from '../ui/input'
import { Separator } from '../ui/separator'
import { Avatar, LabelChip, PriorityIcon, StatusBadge, TypeBadge } from './meta'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../ui/dropdown-menu'

export function IssuePanel() {
  const { projectKey } = useParams<{ projectKey: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const issueKey = searchParams.get('issue')
  const [number, setNumber] = useState<number | null>(null)
  useEffect(() => {
    if (issueKey?.startsWith(`${projectKey}-`)) {
      setNumber(Number(issueKey.slice(projectKey!.length + 1)) || null)
    } else {
      setNumber(null)
    }
  }, [issueKey, projectKey])

  const { data: issue, isPending } = useQuery({
    queryKey: queryKeys.issue(projectKey!, number!),
    queryFn: () => issueApi.get(projectKey!, number!),
    enabled: !!number,
  })

  if (!issueKey) return null

  return (
    <Sheet open onOpenChange={(open) => {
      if (!open) {
        const next = new URLSearchParams(searchParams)
        next.delete('issue')
        setSearchParams(next)
      }
    }}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-[min(1100px,90vw)]">
        {isPending && <div className="p-8 text-sm text-muted-foreground">Loading issue…</div>}
        {issue && number && <IssueBody key={issue.id} issue={issue} projectKey={projectKey!} number={number} />}
      </SheetContent>
    </Sheet>
  )
}

function IssueBody({ issue, projectKey, number }: { issue: Issue; projectKey: string; number: number }) {
  const queryClient = useQueryClient()

  // ponytail: `e` shortcut lives here (mounted only while the panel is open), same guards as useListNav so typing in inputs never triggers it
  const titleEdit = useRef<(() => void) | null>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key.toLowerCase() === 'e') {
        e.preventDefault()
        titleEdit.current?.()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const update = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      issueApi.update(projectKey, number, {
        title: issue.title,
        description: issue.description,
        type: issue.type,
        status: issue.status,
        priority: issue.priority,
        assigneeId: issue.assigneeId,
        epicId: issue.epicId,
        sprintId: issue.sprintId,
        releaseId: issue.releaseId,
        estimate: issue.estimate,
        ...patch,
      }),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.issue(projectKey, number) })
      const previous = queryClient.getQueryData<Issue>(queryKeys.issue(projectKey, number))
      queryClient.setQueryData<Issue>(queryKeys.issue(projectKey, number), (old) =>
        old ? { ...old, ...patch } : old,
      )
      return { previous }
    },
    onError: (_err, _data, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(queryKeys.issue(projectKey, number), ctx.previous)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.issue(projectKey, number) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.issues(projectKey) })
    },
  })

  const remove = useMutation({
    mutationFn: () => issueApi.remove(projectKey, number),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.issues(projectKey) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects })
      void queryClient.invalidateQueries({ queryKey: queryKeys.sprints(projectKey) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.releases(projectKey) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.epics(projectKey) })
      window.history.replaceState(null, '', window.location.pathname + window.location.search.replace(/(&|\?)issue=[^&]*/, ''))
      window.dispatchEvent(new PopStateEvent('popstate'))
    },
  })

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 border-b bg-background/95 px-6 py-4 backdrop-blur">
        <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono font-medium text-foreground">{issue.key}</span>
          <span>·</span>
          <TypeBadge type={issue.type} />
          <span className="ml-auto flex items-center gap-1.5">
            <Clock className="size-3" />
            Created {new Date(issue.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            <span className="text-muted-foreground/50">·</span>
            Updated {timeAgo(issue.updatedAt)}
          </span>
        </div>
        <TitleEditor issue={issue} onSave={(title) => update.mutate({ title })} editRequestRef={titleEdit} />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <InlineStatus status={issue.status} onSelect={(status) => update.mutate({ status })} />
          <InlinePriority priority={issue.priority} onSelect={(priority) => update.mutate({ priority })} />
        </div>
      </div>

      <div className="px-6 py-5">
        <DescriptionEditor issue={issue} onSave={(description) => update.mutate({ description: description || null })} />
        <Separator className="my-5" />
        <CommentsSection projectKey={projectKey} number={number} />
        <Separator className="my-5" />
        <HistorySection projectKey={projectKey} number={number} />
      </div>

      <div className="border-t px-6 py-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <InlineAssignee issue={issue} onSelect={(assigneeId) => update.mutate({ assigneeId })} />
          <InlineField label="Reporter">{issue.reporter.name}</InlineField>
          <InlineEpic issue={issue} onSelect={(epicId) => update.mutate({ epicId })} />
          <InlineSprint issue={issue} onSelect={(sprintId) => update.mutate({ sprintId })} />
          <InlineRelease issue={issue} onSelect={(releaseId) => update.mutate({ releaseId })} />
          <InlineEstimate issue={issue} onSelect={(estimate) => update.mutate({ estimate })} />
        </div>
        <div className="mt-4">
          <InlineLabels issue={issue} projectKey={projectKey} number={number} />
        </div>
        <Separator className="my-4" />
        <AttachmentsSection projectKey={projectKey} number={number} />
        <div className="mt-4 flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={remove.isPending}
            onClick={() => remove.mutate()}
          >
            {remove.isPending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Trash2 className="mr-1 size-3.5" />}
            Delete issue
          </Button>
        </div>
      </div>
    </div>
  )
}

function TitleEditor({ issue, onSave, editRequestRef }: {
  issue: Issue
  onSave: (title: string) => void
  editRequestRef?: RefObject<(() => void) | null>
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(issue.title)
  const exiting = useRef(false)
  useEffect(() => { setValue(issue.title) }, [issue.title])

  const requestEdit = () => {
    exiting.current = false
    setEditing(true)
  }
  useEffect(() => {
    if (!editRequestRef) return
    editRequestRef.current = requestEdit
    return () => { editRequestRef.current = null }
  }, [editRequestRef])

  // ponytail: exiting guards the blur that fires when the input unmounts after Enter/buttons, so onSave never runs twice
  const commit = () => {
    if (exiting.current) return
    const trimmed = value.trim()
    exiting.current = true
    setEditing(false)
    if (trimmed && trimmed !== issue.title) onSave(trimmed)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          className="h-8 flex-1 text-base font-semibold leading-snug md:text-base"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            else if (e.key === 'Escape') { setValue(issue.title); setEditing(false) }
          }}
          onBlur={commit}
        />
        <Button size="sm" className="shrink-0" onMouseDown={(e) => e.preventDefault()} onClick={commit}>
          <Save className="mr-1 size-3.5" /> Save
        </Button>
        <Button size="sm" variant="ghost" className="shrink-0" onMouseDown={(e) => e.preventDefault()} onClick={() => { setValue(issue.title); setEditing(false) }}>
          Cancel
        </Button>
      </div>
    )
  }

  return (
    <button className="group -mx-1 block w-full rounded-md px-1 py-0.5 text-left hover:bg-accent/50" onClick={requestEdit}>
      <h2 className="text-base font-semibold leading-snug">{issue.title}</h2>
    </button>
  )
}

function InlineStatus({ status, onSelect }: { status: Status; onSelect: (s: Status) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1 rounded-md border bg-secondary/40 px-2 py-1 text-xs font-medium hover:bg-accent">
          <StatusBadge status={status} className="border-0 bg-transparent px-0 py-0" />
          <ChevronDown className="size-3 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {STATUSES.map((s) => (
          <DropdownMenuItem key={s} onClick={() => onSelect(s)} className="justify-between">
            <StatusBadge status={s} className="border-0 bg-transparent px-0 py-0" />
            {s === status && <Check className="size-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function InlinePriority({ priority, onSelect }: { priority: Priority; onSelect: (p: Priority) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1.5 rounded-md border bg-secondary/40 px-2 py-1 text-xs font-medium hover:bg-accent">
          <PriorityIcon priority={priority} />
          {priority}
          <ChevronDown className="size-3 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {PRIORITIES.map((p) => (
          <DropdownMenuItem key={p} onClick={() => onSelect(p)} className="justify-between">
            <span className="flex items-center gap-2"><PriorityIcon priority={p} />{p}</span>
            {p === priority && <Check className="size-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function DescriptionEditor({ issue, onSave }: { issue: Issue; onSave: (d: string | null) => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(issue.description ?? '')
  useEffect(() => {
    setValue(issue.description ?? '')
  }, [issue.description])

  if (editing) {
    return (
      <div className="grid gap-2">
        <Textarea
          autoFocus
          rows={8}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Add a description…"
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={() => { onSave(value); setEditing(false) }}>
            <Save className="mr-1 size-3.5" /> Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setValue(issue.description ?? ''); setEditing(false) }}>Cancel</Button>
        </div>
      </div>
    )
  }

  return (
    <button className="group w-full rounded-md p-1 text-left hover:bg-accent/50" onClick={() => setEditing(true)}>
      {issue.description ? (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{issue.description}</p>
      ) : (
        <p className="text-sm text-muted-foreground">Add a description…</p>
      )}
    </button>
  )
}

function CommentsSection({ projectKey, number }: { projectKey: string; number: number }) {
  const queryClient = useQueryClient()
  const [body, setBody] = useState('')
  const { data: comments } = useQuery({
    queryKey: queryKeys.comments(projectKey, number),
    queryFn: () => issueApi.comments(projectKey, number),
  })

  const add = useMutation({
    mutationFn: () => issueApi.addComment(projectKey, number, body),
    onSuccess: () => {
      setBody('')
      void queryClient.invalidateQueries({ queryKey: queryKeys.comments(projectKey, number) })
    },
  })
  const remove = useMutation({
    mutationFn: (id: string) => issueApi.removeComment(projectKey, number, id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.comments(projectKey, number) }),
  })

  return (
    <div>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <MessageSquare className="size-4 text-muted-foreground" />
        Comments
        <span className="text-xs font-normal text-muted-foreground">{comments?.length ?? 0}</span>
      </h3>
      <div className="grid gap-3">
        {comments?.map((c) => (
          <div key={c.id} className="flex gap-3">
            <Avatar name={c.author.name} />
            <div className="min-w-0 flex-1 rounded-lg border bg-card p-3">
              <div className="mb-1 flex items-center gap-2 text-xs">
                <span className="font-semibold">{c.author.name}</span>
                <span className="text-muted-foreground">{timeAgo(c.createdAt)}</span>
                <button
                  className="ml-auto text-muted-foreground hover:text-destructive"
                  onClick={() => remove.mutate(c.id)}
                  title="Delete comment"
                >
                  <X className="size-3.5" />
                </button>
              </div>
              <p className="whitespace-pre-wrap text-sm">{c.body}</p>
            </div>
          </div>
        ))}
        <div className="flex gap-2">
          <Textarea
            rows={3}
            placeholder="Write a comment…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void add.mutate()
            }}
          />
        </div>
        <div className="flex justify-end">
          <Button size="sm" disabled={!body.trim() || add.isPending} onClick={() => add.mutate()}>
            {add.isPending && <Loader2 className="mr-1 size-3.5 animate-spin" />}
            Comment
          </Button>
        </div>
      </div>
    </div>
  )
}

const FIELD_LABELS: Record<string, string> = {
  Status: 'Status', Priority: 'Priority', Assignee: 'Assignee', Title: 'Title',
  Description: 'Description', Epic: 'Epic', Sprint: 'Sprint', Release: 'Release',
  Estimate: 'Estimate', Type: 'Type', Label: 'Labels',
}

function HistorySection({ projectKey, number }: { projectKey: string; number: number }) {
  const { data: history } = useQuery({
    queryKey: queryKeys.history(projectKey, number),
    queryFn: () => issueApi.history(projectKey, number),
  })
  const { data: users } = useQuery({ queryKey: queryKeys.users, queryFn: authApi.users })
  const { data: sprints } = useQuery({ queryKey: queryKeys.sprints(projectKey), queryFn: () => sprintApi.list(projectKey) })
  const { data: epics } = useQuery({ queryKey: queryKeys.epics(projectKey), queryFn: () => epicApi.list(projectKey) })
  const { data: releases } = useQuery({ queryKey: queryKeys.releases(projectKey), queryFn: () => releaseApi.list(projectKey) })
  const { data: labels } = useQuery({ queryKey: queryKeys.labels(projectKey), queryFn: () => labelApi.list(projectKey) })

  const lookups = useMemo(() => {
    const u = new Map<string, string>()
    users?.forEach((x) => u.set(x.id, x.name))
    const s = new Map<string, string>()
    sprints?.forEach((x) => s.set(x.id, x.name))
    const e = new Map<string, string>()
    epics?.forEach((x) => e.set(x.id, x.name))
    const r = new Map<string, string>()
    releases?.forEach((x) => r.set(x.id, x.name))
    const l = new Map<string, string>()
    labels?.forEach((x) => l.set(x.id, x.name))
    return { user: u, sprint: s, epic: e, release: r, label: l }
  }, [users, sprints, epics, releases, labels])

  if (!history?.length) return null
  return (
    <div>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <History className="size-4 text-muted-foreground" />
        History
      </h3>
      <div className="relative space-y-3 pl-5">
        <span className="absolute left-1 top-1 bottom-1 w-px bg-border" />
        {history.map((h) => (
          <HistoryRow key={h.id} h={h} lookups={lookups} />
        ))}
      </div>
    </div>
  )
}

type HistoryLookups = {
  user: Map<string, string>
  sprint: Map<string, string>
  epic: Map<string, string>
  release: Map<string, string>
  label: Map<string, string>
}

function resolveValue(value: string | null | undefined, field: string, lookups: HistoryLookups): string {
  if (value == null) return '(empty)'
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  if (!isUuid) return value
  const map = (() => {
    switch (field) {
      case 'Assignee':
      case 'Reporter':
        return lookups.user
      case 'Sprint':
        return lookups.sprint
      case 'Epic':
        return lookups.epic
      case 'Release':
        return lookups.release
      case 'Labels':
        return lookups.label
      default:
        return null
    }
  })()
  return map?.get(value) ?? value.slice(0, 8) + '…'
}

function HistoryRow({ h, lookups }: { h: HistoryEntry; lookups: HistoryLookups }) {
  const label = FIELD_LABELS[h.field] ?? h.field
  const oldVal = resolveValue(h.oldValue, h.field, lookups)
  const newVal = resolveValue(h.newValue, h.field, lookups)
  return (
    <div className="relative">
      <span className="absolute -left-5 top-1.5 size-2 rounded-full border-2 border-background bg-primary" />
      <p className="text-xs leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">{h.actor.name}</span> changed {label}
        {h.oldValue != null && (
          <>
            {' '}from <span className="line-through">{oldVal}</span>
          </>
        )}
        {' '}to <span className="font-medium text-foreground">{newVal}</span>
        <span className="ml-1.5 text-[10px] text-muted-foreground/70">{timeAgo(h.createdAt)}</span>
      </p>
    </div>
  )
}

function InlineField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      {children}
    </div>
  )
}

function InlineAssignee({ issue, onSelect }: { issue: Issue; onSelect: (id: string | null) => void }) {
  const { data: users } = useQuery({ queryKey: queryKeys.users, queryFn: authApi.users })
  return (
    <InlineField label="Assignee">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-accent">
            {issue.assignee ? <Avatar name={issue.assignee.name} size={6} /> : <span className="inline-flex size-6 items-center justify-center rounded-full border border-dashed text-muted-foreground"><span className="text-[10px]">—</span></span>}
            <span className="truncate text-xs">{issue.assignee?.name ?? 'Unassigned'}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuItem onClick={() => onSelect(null)}>Unassigned</DropdownMenuItem>
          <DropdownMenuSeparator />
          {users?.map((u) => (
            <DropdownMenuItem key={u.id} onClick={() => onSelect(u.id)}>
              <span className="flex items-center gap-2"><Avatar name={u.name} size={6} />{u.name}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </InlineField>
  )
}

function InlineEpic({ issue, onSelect }: { issue: Issue; onSelect: (id: string | null) => void }) {
  const { projectKey } = useParams<{ projectKey: string }>()
  const { data: epics } = useQuery({ queryKey: queryKeys.epics(projectKey!), queryFn: () => epicApi.list(projectKey!), enabled: !!projectKey })
  return (
    <InlineField label="Epic">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs hover:bg-accent">
            {issue.epicName ?? 'None'}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuItem onClick={() => onSelect(null)}>None</DropdownMenuItem>
          <DropdownMenuSeparator />
          {epics?.map((e) => (
            <DropdownMenuItem key={e.id} onClick={() => onSelect(e.id)}>
              <span className="size-2 rounded-sm" style={{ backgroundColor: e.color }} />
              <span className="ml-2">{e.name}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </InlineField>
  )
}

function InlineSprint({ issue, onSelect }: { issue: Issue; onSelect: (id: string | null) => void }) {
  const { projectKey } = useParams<{ projectKey: string }>()
  const { data: sprints } = useQuery({ queryKey: queryKeys.sprints(projectKey!), queryFn: () => sprintApi.list(projectKey!), enabled: !!projectKey })
  return (
    <InlineField label="Sprint">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs hover:bg-accent">
            <Calendar className="size-3 text-muted-foreground" />
            {issue.sprintName ?? 'Backlog'}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuItem onClick={() => onSelect(null)}>Backlog</DropdownMenuItem>
          <DropdownMenuSeparator />
          {sprints?.map((s) => (
            <DropdownMenuItem key={s.id} onClick={() => onSelect(s.id)}>
              {s.name}{s.isActive ? ' (active)' : ''}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </InlineField>
  )
}

function InlineRelease({ issue, onSelect }: { issue: Issue; onSelect: (id: string | null) => void }) {
  const { projectKey } = useParams<{ projectKey: string }>()
  const { data: releases } = useQuery({ queryKey: queryKeys.releases(projectKey!), queryFn: () => releaseApi.list(projectKey!), enabled: !!projectKey })
  return (
    <InlineField label="Release">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs hover:bg-accent">
            <Flag className="size-3 text-muted-foreground" />
            {issue.releaseName ?? 'None'}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuItem onClick={() => onSelect(null)}>None</DropdownMenuItem>
          <DropdownMenuSeparator />
          {releases?.map((r) => (
            <DropdownMenuItem key={r.id} onClick={() => onSelect(r.id)}>
              {r.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </InlineField>
  )
}

function InlineEstimate({ issue, onSelect }: { issue: Issue; onSelect: (estimate: number | null) => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(issue.estimate?.toString() ?? '')
  useEffect(() => setValue(issue.estimate?.toString() ?? ''), [issue.estimate])
  if (editing) {
    return (
      <InlineField label="Estimate">
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault()
            onSelect(value ? Number(value) : null)
            setEditing(false)
          }}
        >
          <Input autoFocus size={4} className="h-6 w-14 text-xs" value={value} onChange={(e) => setValue(e.target.value)} onBlur={() => setEditing(false)} />
        </form>
      </InlineField>
    )
  }
  return (
    <InlineField label="Estimate">
      <button className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs hover:bg-accent" onClick={() => setEditing(true)}>
        <Zap className="size-3 text-muted-foreground" />
        {issue.estimate ?? '—'}
      </button>
    </InlineField>
  )
}

function InlineLabels({ issue, projectKey, number }: { issue: Issue; projectKey: string; number: number }) {
  const queryClient = useQueryClient()
  const { data: labels } = useQuery({ queryKey: queryKeys.labels(projectKey), queryFn: () => labelApi.list(projectKey) })
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.issue(projectKey, number) })
    void queryClient.invalidateQueries({ queryKey: queryKeys.issues(projectKey) })
  }
  const toggle = (id: string) => {
    const has = issue.labels.some((l) => l.id === id)
    const action = has ? issueApi.removeLabel(projectKey, number, id) : issueApi.addLabel(projectKey, number, id)
    action.then(invalidate)
  }
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Labels</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {issue.labels.map((l) => <LabelChip key={l.id} name={l.name} color={l.color} />)}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-1 rounded-md border border-dashed px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent">
              <Plus className="size-3" /> Label
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            {labels?.map((l) => (
              <DropdownMenuItem key={l.id} onClick={() => toggle(l.id)} className="justify-between">
                <LabelChip name={l.name} color={l.color} />
                {issue.labels.some((x) => x.id === l.id) && <Check className="size-3.5" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

function AttachmentsSection({ projectKey, number }: { projectKey: string; number: number }) {
  const queryClient = useQueryClient()
  const { data: attachments } = useQuery({
    queryKey: queryKeys.attachments(projectKey, number),
    queryFn: () => issueApi.attachments(projectKey, number),
  })
  const upload = useMutation({
    mutationFn: (file: File) => issueApi.upload(projectKey, number, file),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.attachments(projectKey, number) }),
  })
  const remove = useMutation({
    mutationFn: (id: string) => issueApi.removeAttachment(projectKey, number, id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.attachments(projectKey, number) }),
  })

  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Attachments ({attachments?.length ?? 0})</p>
      <div className="grid gap-1.5">
        {attachments?.map((a) => (
          <div key={a.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs">
            <Paperclip className="size-3.5 text-muted-foreground" />
            <a className="truncate font-medium hover:underline" href={issueApi.downloadUrl(projectKey, number, a.id)} target="_blank" rel="noreferrer">
              {a.fileName}
            </a>
            <span className="ml-auto text-muted-foreground">
              {Math.round(a.size / 1024)} KB · {a.uploadedBy.name}
            </span>
            <button className="text-muted-foreground hover:text-destructive" onClick={() => remove.mutate(a.id)}>
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground hover:bg-accent">
          <PaperclipIcon className="size-3.5" />
          {upload.isPending ? 'Uploading…' : 'Attach file'}
          <input
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) upload.mutate(file)
              e.target.value = ''
            }}
          />
        </label>
      </div>
    </div>
  )
}
