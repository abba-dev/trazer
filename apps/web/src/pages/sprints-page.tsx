import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Calendar, Check, Flag, Loader2, Play, Plus, Trash2 } from 'lucide-react'
import { issueApi, sprintApi, type Issue, type Sprint } from '../lib/api'
import { queryKeys } from '../lib/query-keys'
import { Button } from '../components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { cn } from '../lib/utils'
import { STATUS_META } from '../components/issues/meta'
import { IssuePanel } from '../components/issues/issue-panel'

export function SprintsPage() {
  const { projectKey } = useParams<{ projectKey: string }>()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')

  const { data: sprints, isPending } = useQuery({
    queryKey: queryKeys.sprints(projectKey!),
    queryFn: () => sprintApi.list(projectKey!),
  })
  const { data: issues } = useQuery({
    queryKey: queryKeys.issues(projectKey!),
    queryFn: () => issueApi.list(projectKey!),
  })

  const create = useMutation({
    mutationFn: () => sprintApi.create(projectKey!, { name }),
    onSuccess: () => {
      setCreateOpen(false)
      setName('')
      void queryClient.invalidateQueries({ queryKey: queryKeys.sprints(projectKey!) })
    },
  })

  if (isPending) return <div className="p-8 text-sm text-muted-foreground">Loading sprints…</div>

  return (
    <div className="mx-auto max-w-5xl px-6 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Sprints</h2>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" /> New sprint
        </Button>
      </div>

      <div className="grid gap-4">
        {sprints?.length === 0 && (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No sprints yet — create one to start planning.
          </p>
        )}
        {sprints?.map((sprint) => (
          <SprintCard key={sprint.id} sprint={sprint} issues={(issues ?? []).filter((i) => i.sprintId === sprint.id)} />
        ))}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New sprint</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <Input
              autoFocus
              placeholder="Sprint name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void create.mutate()
              }}
            />
            <div className="flex justify-end">
              <Button disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
                {create.isPending && <Loader2 className="mr-1 size-4 animate-spin" />}
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <IssuePanel />
    </div>
  )
}

function SprintCard({ sprint, issues }: { sprint: Sprint; issues: Issue[] }) {
  const { projectKey } = useParams<{ projectKey: string }>()
  const queryClient = useQueryClient()

  const toggleActive = useMutation({
    mutationFn: () => sprintApi.update(projectKey!, sprint.id, { isActive: !sprint.isActive }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sprints(projectKey!) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.issues(projectKey!) })
    },
  })
  const remove = useMutation({
    mutationFn: () => sprintApi.remove(projectKey!, sprint.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.sprints(projectKey!) }),
  })

  const byStatus = useMemo(() => {
    const map = new Map<string, Issue[]>()
    for (const i of issues) {
      const list = map.get(i.status) ?? []
      list.push(i)
      map.set(i.status, list)
    }
    return map
  }, [issues])

  const points = issues.reduce((sum, i) => sum + (i.estimate ?? 0), 0)
  const donePoints = issues.filter((i) => i.status === 'Done').reduce((sum, i) => sum + (i.estimate ?? 0), 0)
  const pct = points > 0 ? Math.round((donePoints / points) * 100) : 0

  return (
    <section className="rounded-lg border bg-card">
      <div className="flex items-center gap-3 px-4 py-3">
        <h3 className="text-sm font-semibold">{sprint.name}</h3>
        {sprint.isActive ? (
          <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" /> Active
          </span>
        ) : (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Planned</span>
        )}
        {sprint.endDate && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="size-3.5" />
            {new Date(sprint.endDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {sprint.isActive ? (
            <Button size="sm" variant="outline" onClick={() => toggleActive.mutate()}>
              <Check className="mr-1 size-3.5" /> End sprint
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => toggleActive.mutate()} disabled={toggleActive.isPending}>
              <Play className="mr-1 size-3.5" /> Start sprint
            </Button>
          )}
          <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => remove.mutate()}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
      {sprint.goal && <p className="px-4 pb-2 text-xs text-muted-foreground">Goal: {sprint.goal}</p>}
      <div className="h-1 w-full bg-muted">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="grid grid-cols-5 divide-x divide-border border-t">
        {(['ToDo', 'InProgress', 'InReview', 'QA', 'Done'] as const).map((status) => (
          <div key={status} className="px-3 py-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {STATUS_META[status].label}
              </span>
              <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground">
                {(byStatus.get(status) ?? []).length}
              </span>
            </div>
            <ul className="grid gap-1">
              {byStatus.get(status)?.map((issue) => (
                <li key={issue.id} className="flex items-center gap-1.5 rounded px-1.5 py-1 hover:bg-accent/50">
                  <span className="truncate text-xs font-medium">{issue.title}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 border-t px-4 py-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Flag className="size-3.5" /> {issues.length} issues</span>
        <span>{points} pts total</span>
        <span className={cn('font-medium', pct === 100 ? 'text-emerald-600 dark:text-emerald-400' : '')}>
          {donePoints} pts done ({pct}%)
        </span>
      </div>
    </section>
  )
}
