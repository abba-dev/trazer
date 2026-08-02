import { useState } from 'react'
import { useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Flag, Loader2, PackageOpen, Plus, Rocket, Trash2 } from 'lucide-react'
import { issueApi, releaseApi, type Release } from '../lib/api'
import { queryKeys } from '../lib/query-keys'
import { Button } from '../components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import { IssuePanel } from '../components/issues/issue-panel'
import { cn } from '../lib/utils'
import { formatDate } from '../lib/api'

export function ReleasesPage() {
  const { projectKey } = useParams<{ projectKey: string }>()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const { data: releases, isPending } = useQuery({
    queryKey: queryKeys.releases(projectKey!),
    queryFn: () => releaseApi.list(projectKey!),
  })
  const { data: issues } = useQuery({
    queryKey: queryKeys.issues(projectKey!),
    queryFn: () => issueApi.list(projectKey!),
  })

  const create = useMutation({
    mutationFn: () => releaseApi.create(projectKey!, { name, description: description || undefined }),
    onSuccess: () => {
      setCreateOpen(false)
      setName('')
      setDescription('')
      void queryClient.invalidateQueries({ queryKey: queryKeys.releases(projectKey!) })
    },
  })

  if (isPending) return <div className="p-8 text-sm text-muted-foreground">Loading releases…</div>

  const open = releases?.filter((r) => r.status === 'Open') ?? []
  const released = releases?.filter((r) => r.status === 'Released') ?? []

  return (
    <div className="mx-auto max-w-5xl px-6 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Releases</h2>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" /> New release
        </Button>
      </div>

      <ReleaseGroup title="Open" icon={PackageOpen} releases={open} issues={issues ?? []} />
      <ReleaseGroup title="Released" icon={Rocket} releases={released} issues={issues ?? []} />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New release</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <Input autoFocus placeholder="Release name (e.g. v0.2)" value={name} onChange={(e) => setName(e.target.value)} />
            <Textarea placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
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

function ReleaseGroup({ title, icon: Icon, releases, issues }: { title: string; icon: typeof Flag; releases: Release[]; issues: ReturnType<typeof Object> | unknown[] }) {
  if (releases.length === 0) return null
  return (
    <div className="mb-8">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 text-muted-foreground" />
        {title}
      </h3>
      <div className="grid gap-3">
        {releases.map((release) => (
          <ReleaseCard key={release.id} release={release} issues={(issues as { releaseId: string | null; title: string; estimate: number | null; status: string; id: string }[]).filter((i) => i.releaseId === release.id)} />
        ))}
      </div>
    </div>
  )
}

function ReleaseCard({ release, issues }: { release: Release; issues: { releaseId: string | null; title: string; estimate: number | null; status: string; id: string }[] }) {
  const { projectKey } = useParams<{ projectKey: string }>()
  const queryClient = useQueryClient()

  const releaseIt = useMutation({
    mutationFn: () => releaseApi.update(projectKey!, release.id, { status: 'Released' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.releases(projectKey!) }),
  })
  const remove = useMutation({
    mutationFn: () => releaseApi.remove(projectKey!, release.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.releases(projectKey!) }),
  })

  const points = issues.reduce((sum, i) => sum + (i.estimate ?? 0), 0)
  const done = issues.filter((i) => i.status === 'Done').length
  const pct = issues.length > 0 ? Math.round((done / issues.length) * 100) : 0

  return (
    <section className="rounded-lg border bg-card">
      <div className="flex items-center gap-3 px-4 py-3">
        <h4 className="text-sm font-semibold">{release.name}</h4>
        {release.status === 'Released' ? (
          <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
            <Check className="size-3" /> Released {release.releasedAt ? formatDate(release.releasedAt) : ''}
          </span>
        ) : (
          <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">Open</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {release.status === 'Open' && (
            <Button size="sm" variant="outline" onClick={() => releaseIt.mutate()}>
              <Rocket className="mr-1 size-3.5" /> Release
            </Button>
          )}
          <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => remove.mutate()}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
      {release.description && <p className="px-4 pb-2 text-xs text-muted-foreground">{release.description}</p>}
      <div className="h-1 w-full bg-muted">
        <div className={cn('h-full transition-all', release.status === 'Released' ? 'bg-emerald-500' : 'bg-blue-500')} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center gap-3 border-t px-4 py-2 text-xs text-muted-foreground">
        <span>{issues.length} issues</span>
        <span>{points} pts</span>
        <span className="ml-auto font-medium">{done}/{issues.length} done ({pct}%)</span>
      </div>
    </section>
  )
}
