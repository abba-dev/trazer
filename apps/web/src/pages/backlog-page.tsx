import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Calendar, ChevronDown, ListChecks, Loader2, Plus } from 'lucide-react'
import { epicApi, issueApi, sprintApi, type Epic, type Issue, type Sprint } from '../lib/api'
import { queryKeys } from '../lib/query-keys'
import { Button } from '../components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../components/ui/dropdown-menu'
import { IssueAvatar, LabelChip } from '../components/issues/meta'
import { IssuePanel } from '../components/issues/issue-panel'
import { cn } from '../lib/utils'

export function BacklogPage() {
  const { projectKey } = useParams<{ projectKey: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()

  const { data: issues, isPending } = useQuery({
    queryKey: queryKeys.issues(projectKey!),
    queryFn: () => issueApi.list(projectKey!),
  })
  const { data: sprints } = useQuery({
    queryKey: queryKeys.sprints(projectKey!),
    queryFn: () => sprintApi.list(projectKey!),
  })
  const { data: epics } = useQuery({
    queryKey: queryKeys.epics(projectKey!),
    queryFn: () => epicApi.list(projectKey!),
  })

  const [createOpen, setCreateOpen] = useState(false)
  const [newSprintName, setNewSprintName] = useState('')

  const assign = useMutation({
    mutationFn: ({ issueNumber, sprintId }: { issueNumber: number; sprintId: string | null }) =>
      issueApi.update(projectKey!, issueNumber, { sprintId }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.issues(projectKey!) }),
  })

  const createSprint = useMutation({
    mutationFn: () => sprintApi.create(projectKey!, { name: newSprintName }),
    onSuccess: () => {
      setCreateOpen(false)
      setNewSprintName('')
      void queryClient.invalidateQueries({ queryKey: queryKeys.sprints(projectKey!) })
    },
  })

  const openIssue = (issue: Issue) => {
    const next = new URLSearchParams(searchParams)
    next.set('issue', issue.key)
    setSearchParams(next)
  }

  const backlog = (issues ?? []).filter((i) => i.sprintId == null && i.status !== 'Done')
  const done = (issues ?? []).filter((i) => i.status === 'Done')

  if (isPending) return <div className="p-8 text-sm text-muted-foreground">Loading backlog…</div>

  return (
    <div className="mx-auto max-w-5xl px-6 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Backlog</h2>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" /> New sprint
        </Button>
      </div>

      {sprints?.map((sprint) => (
        <SprintSection
          key={sprint.id}
          sprint={sprint}
          issues={(issues ?? []).filter((i) => i.sprintId === sprint.id)}
          onAssign={(issueNumber, sprintId) => assign.mutate({ issueNumber, sprintId })}
        />
      ))}

      <section className="mb-6">
        <div className="mb-2 flex items-center gap-2">
          <ListChecks className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Backlog</h3>
          <span className="text-xs text-muted-foreground">{backlog.length} issues</span>
        </div>
        <IssueList
          issues={backlog}
          epics={epics ?? []}
          onOpen={openIssue}
          onAssign={(issueNumber, sprintId) => assign.mutate({ issueNumber, sprintId })}
        />
      </section>

      {done.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Done ({done.length})</h3>
          <IssueList issues={done} epics={epics ?? []} onOpen={openIssue} onAssign={() => undefined} collapsed />
        </section>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New sprint</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <Input
              autoFocus
              placeholder="Sprint name (e.g. Sprint 3)"
              value={newSprintName}
              onChange={(e) => setNewSprintName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void createSprint.mutate()
              }}
            />
            <div className="flex justify-end">
              <Button disabled={!newSprintName.trim() || createSprint.isPending} onClick={() => createSprint.mutate()}>
                {createSprint.isPending && <Loader2 className="mr-1 size-4 animate-spin" />}
                Create sprint
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <IssuePanel />
    </div>
  )
}

function SprintSection({
  sprint,
  issues,
  onAssign,
}: {
  sprint: Sprint
  issues: Issue[]
  onAssign: (issueNumber: number, sprintId: string | null) => void
}) {
  const { projectKey } = useParams<{ projectKey: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const [collapsed, setCollapsed] = useState(false)

  const openIssue = (issue: Issue) => {
    const next = new URLSearchParams(searchParams)
    next.set('issue', issue.key)
    setSearchParams(next)
  }

  const startSprint = useMutation({
    mutationFn: () => sprintApi.update(projectKey!, sprint.id, { isActive: !sprint.isActive }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sprints(projectKey!) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.issues(projectKey!) })
    },
  })

  const points = issues.reduce((sum, i) => sum + (i.estimate ?? 0), 0)

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center gap-2 rounded-md px-2 py-1">
        <button onClick={() => setCollapsed((c) => !c)} className="text-muted-foreground hover:text-foreground">
          <ChevronDown className={cn('size-4 transition-transform', collapsed && '-rotate-90')} />
        </button>
        <h3 className="text-sm font-semibold">{sprint.name}</h3>
        {sprint.isActive && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Active</span>}
        <span className="text-xs text-muted-foreground">
          {issues.length} issues · {points} pts
          {sprint.endDate && ` · ends ${new Date(sprint.endDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="ml-auto h-7">
              <Calendar className="mr-1 size-3.5" /> Manage
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => startSprint.mutate()}>
              {sprint.isActive ? 'End sprint' : 'Start sprint'}
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={`/projects/${projectKey}/board?sprint=${sprint.id}`}>Open on board</a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {!collapsed && (
        <IssueList issues={issues} epics={[]} onOpen={openIssue} onAssign={onAssign} />
      )}
    </section>
  )
}

function IssueList({
  issues,
  epics,
  onOpen,
  onAssign,
  collapsed = false,
}: {
  issues: Issue[]
  epics: Epic[]
  onOpen: (issue: Issue) => void
  onAssign: (issueNumber: number, sprintId: string | null) => void
  collapsed?: boolean
}) {
  const { projectKey } = useParams<{ projectKey: string }>()
  const queryClient = useQueryClient()
  const [epicFilter, setEpicFilter] = useState<string | null>(null)

  const filtered = epicFilter ? issues.filter((i) => i.epicId === epicFilter) : issues

  const handleOpen = (issue: Issue) => {
    void queryClient.prefetchQuery({ queryKey: queryKeys.issue(projectKey!, issue.number), queryFn: () => issueApi.get(projectKey!, issue.number) })
    onOpen(issue)
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      {epics.length > 0 && (
        <div className="flex items-center gap-1 border-b px-3 py-1.5">
          <span className="text-[11px] font-medium text-muted-foreground">Epic:</span>
          <button
            onClick={() => setEpicFilter(null)}
            className={cn(
              'rounded px-2 py-0.5 text-[11px] font-medium',
              epicFilter === null ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60',
            )}
          >
            All
          </button>
          {epics.map((e) => (
            <button
              key={e.id}
              onClick={() => setEpicFilter(e.id)}
              className={cn(
                'flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-medium',
                epicFilter === e.id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60',
              )}
            >
              <span className="size-2 rounded-sm" style={{ backgroundColor: e.color }} />
              {e.name}
            </button>
          ))}
        </div>
      )}
      {collapsed && filtered.length > 20 ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">
          {filtered.length} completed issues — archived from view
        </p>
      ) : filtered.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">No issues here.</p>
      ) : (
        <ul>
          {filtered.map((issue, idx) => (
            <li key={issue.id}>
              {idx > 0 && <hr className="mx-3 border-t border-border/60" />}
              <div className="flex items-center gap-3 px-3 py-2 hover:bg-accent/40">
                <span className="font-mono text-[11px] text-muted-foreground">{issue.key}</span>
                <button onClick={() => handleOpen(issue)} className="min-w-0 flex-1 truncate text-left text-[13px] font-medium hover:underline">
                  {issue.title}
                </button>
                {epicFilter == null && issue.epicName && (
                  <span className="hidden text-[11px] text-muted-foreground md:inline">◈ {issue.epicName}</span>
                )}
                {issue.labels.slice(0, 2).map((l) => (
                  <LabelChip key={l.id} name={l.name} color={l.color} />
                ))}
                <span className="hidden text-[11px] text-muted-foreground sm:inline">{issue.estimate != null ? `${issue.estimate} pts` : ''}</span>
                {issue.assignee ? <IssueAvatar issue={issue} /> : <span className="size-6" />}
                <SprintSelect sprintId={issue.sprintId} onSelect={(sprintId) => onAssign(issue.number, sprintId)} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SprintSelect({ sprintId, onSelect }: { sprintId: string | null; onSelect: (id: string | null) => void }) {
  const { projectKey } = useParams<{ projectKey: string }>()
  const { data: sprints } = useQuery({
    queryKey: queryKeys.sprints(projectKey!),
    queryFn: () => sprintApi.list(projectKey!),
  })
  const current = sprints?.find((s) => s.id === sprintId)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground">
          <Calendar className="size-3" />
          {current?.name ?? 'Unplanned'}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={() => onSelect(null)}>Unplanned</DropdownMenuItem>
        <DropdownMenuSeparator />
        {sprints?.map((s) => (
          <DropdownMenuItem key={s.id} onClick={() => onSelect(s.id)}>
            {s.name}
            {s.isActive ? ' (active)' : ''}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
