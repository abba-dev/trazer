import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Copy, Download, ExternalLink, FileJson, FileText, GitBranch, Loader2, Plus, Settings as SettingsIcon, Trash2, Upload, Users, Webhook } from 'lucide-react'
import { issueApi, projectApi, authApi, STATUSES, webhookApi, type ImportReport } from '../lib/api'
import { queryKeys } from '../lib/query-keys'
import { cn } from '../lib/utils'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import { useNavigate } from 'react-router'

const STATUS_LABELS: Record<string, string> = {
  ToDo: 'To do', InProgress: 'In progress', InReview: 'In review', QA: 'QA', Done: 'Done',
}

export function ProjectSettingsPage() {
  const { projectKey } = useParams<{ projectKey: string }>()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data: project, isPending } = useQuery({
    queryKey: queryKeys.project(projectKey!),
    queryFn: () => projectApi.get(projectKey!),
  })
  const { data: issues } = useQuery({
    queryKey: queryKeys.issues(projectKey!),
    queryFn: () => issueApi.list(projectKey!),
  })
  const { data: users } = useQuery({ queryKey: queryKeys.users, queryFn: authApi.users })

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (project && !editing) {
      setName(project.name)
      setDescription(project.description ?? '')
    }
  }, [project, editing])

  const save = useMutation({
    mutationFn: () => projectApi.update(projectKey!, { name, description: description || undefined }),
    onSuccess: () => {
      setEditing(false)
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects })
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(projectKey!) })
    },
  })

  const remove = useMutation({
    mutationFn: () => projectApi.remove(projectKey!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects })
      navigate('/projects', { replace: true })
    },
  })

  if (isPending || !project) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <div className="mb-6 flex items-center gap-2">
        <SettingsIcon className="size-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">{project.name} settings</h2>
        <span className="rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{project.key}</span>
      </div>

      <section className="mb-6 rounded-lg border bg-card p-5">
        <h3 className="mb-3 text-sm font-semibold">Details</h3>
        {editing ? (
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <label className="text-xs text-muted-foreground">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs text-muted-foreground">Description</label>
              <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              <Button disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>
                {save.isPending && <Loader2 className="mr-1 size-4 animate-spin" />}
                Save
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-2">
            <p className="text-sm">{project.name}</p>
            <p className="text-xs text-muted-foreground">{project.description || 'No description.'}</p>
            <div>
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Edit</Button>
            </div>
          </div>
        )}
      </section>

      <section className="mb-6 rounded-lg border bg-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Members</h3>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          {users?.length ?? 0} users in this workspace. Project membership follows the workspace roster — manage
          users in <a href="/admin/users" className="text-foreground underline">Users</a>.
        </p>
      </section>

      <WipLimitsSection projectKey={projectKey!} currentLimits={project.wipLimits} />

      <WebhooksSection projectKey={projectKey!} />

      <ExportSection projectKey={projectKey!} />

      <ImportSection projectKey={projectKey!} />

      <GitSection projectKey={projectKey!} />

      <section className="rounded-lg border border-destructive/30 bg-destructive/5 p-5">
        <h3 className="mb-2 text-sm font-semibold text-destructive">Danger zone</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Deletes the project and all its issues ({issues?.length ?? 0} right now). This cannot be undone.
        </p>
        <Button
          variant="destructive"
          size="sm"
          disabled={remove.isPending}
          onClick={() => {
            if (confirm(`Delete project ${project.key} and ${issues?.length ?? 0} issues? This cannot be undone.`)) {
              remove.mutate()
            }
          }}
        >
          {remove.isPending ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Trash2 className="mr-1 size-4" />}
          Delete project
        </Button>
      </section>
    </div>
  )
}

function WipLimitsSection({ projectKey, currentLimits }: { projectKey: string; currentLimits: string | null }) {
  const queryClient = useQueryClient()
  const parsed = (() => {
    if (!currentLimits) return {} as Record<string, number>
    try { return JSON.parse(currentLimits) as Record<string, number> } catch { return {} }
  })()
  const [limits, setLimits] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {}
    for (const s of STATUSES) out[s] = parsed[s] != null ? String(parsed[s]) : ''
    return out
  })
  const [saved, setSaved] = useState(false)

  const save = useMutation({
    mutationFn: () => {
      const out: Record<string, number> = {}
      for (const s of STATUSES) {
        const v = limits[s]?.trim()
        if (v) {
          const n = Number(v)
          if (!Number.isFinite(n) || n < 0) throw new Error(`${s}: must be a non-negative number`)
          if (n > 999) throw new Error(`${s}: max 999`)
          out[s] = Math.floor(n)
        }
      }
      return projectApi.update(projectKey, { wipLimits: Object.keys(out).length ? JSON.stringify(out) : null })
    },
    onSuccess: () => {
      setSaved(true)
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(projectKey) })
      setTimeout(() => setSaved(false), 1500)
    },
  })

  return (
    <section className="mb-6 rounded-lg border bg-card p-5">
      <div className="mb-1 flex items-center gap-2">
        <AlertTriangle className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">WIP limits</h3>
        {saved && <span className="ml-2 text-[11px] text-emerald-500">Saved</span>}
        {save.isError && <span className="ml-2 text-[11px] text-destructive">{save.error.message}</span>}
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Per-status work-in-progress caps. Empty means no limit. Columns over the limit show a red ring
        on the board — over-limit is a warning, not a block.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {STATUSES.map((s) => (
          <div key={s} className="grid gap-1">
            <label className="text-[11px] text-muted-foreground">{STATUS_LABELS[s] ?? s}</label>
            <Input
              type="number"
              min="0"
              max="999"
              placeholder="—"
              value={limits[s] ?? ''}
              onChange={(e) => setLimits((p) => ({ ...p, [s]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setLimits(Object.fromEntries(STATUSES.map((s) => [s, ''])))}>
          Clear
        </Button>
        <Button disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending && <Loader2 className="mr-1 size-4 animate-spin" />}
          Save limits
        </Button>
      </div>
    </section>
  )
}

const WEBHOOK_EVENTS = ['issue.created', 'issue.updated', 'issue.deleted', 'issue.commented']

function ExportSection({ projectKey }: { projectKey: string }) {
  const [busy, setBusy] = useState<null | 'json' | 'csv'>(null)
  const download = async (format: 'json' | 'csv') => {
    setBusy(format)
    try {
      const res = await projectApi.export(projectKey, format)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const cd = res.headers.get('Content-Disposition') ?? ''
      const match = cd.match(/filename="?([^";]+)"?/i)
      const name = match?.[1] ?? `${projectKey}-export.${format}`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 0)
    } finally {
      setBusy(null)
    }
  }
  return (
    <section className="mb-6 rounded-lg border bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <Download className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Export</h3>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Download a snapshot of the project. JSON includes issues, comments, attachments metadata,
        history, labels, epics, sprints, and releases. CSV includes issues only, suitable for
        spreadsheet analysis.
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => download('json')}>
          {busy === 'json' ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <FileJson className="mr-1 size-3.5" />}
          JSON snapshot
        </Button>
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => download('csv')}>
          {busy === 'csv' ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <FileText className="mr-1 size-3.5" />}
          CSV (issues)
        </Button>
      </div>
    </section>
  )
}

function ImportSection({ projectKey }: { projectKey: string }) {
  const [result, setResult] = useState<ImportReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'jira' | 'github' | null>(null)
  const jiraRef = useRef<HTMLInputElement>(null)
  const githubRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File | null, kind: 'jira' | 'github') => {
    if (!file) return
    setError(null)
    setResult(null)
    setBusy(kind)
    try {
      const report = kind === 'jira'
        ? await projectApi.importJira(projectKey, file)
        : await projectApi.importGithub(projectKey, file)
      setResult(report)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="mb-6 rounded-lg border bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <Upload className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Import</h3>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Bring issues from another tracker. Statuses, types and priorities map to their closest
        Trazer equivalent; re-importing the same file updates instead of duplicating.
        Assignees, comments and attachments are not imported. Jira exports: JSON search payload.
        GitHub: the Issues CSV export (issues only — pull requests are skipped).
      </p>
      <div className="flex gap-2">
        <input
          ref={jiraRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => void handleFile(e.target.files?.[0] ?? null, 'jira')}
        />
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => jiraRef.current?.click()}>
          {busy === 'jira' ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <FileJson className="mr-1 size-3.5" />}
          Import Jira export
        </Button>
        <input
          ref={githubRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => void handleFile(e.target.files?.[0] ?? null, 'github')}
        />
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => githubRef.current?.click()}>
          {busy === 'github' ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <FileText className="mr-1 size-3.5" />}
          Import GitHub CSV
        </Button>
      </div>

      {error && (
        <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</p>
      )}

      {result && (
        <div className="mt-3 rounded-md border bg-background/60 p-3 text-xs">
          <p className="mb-1 flex gap-3 font-medium">
            <span className="text-foreground">{result.created} created</span>
            <span className="text-foreground">{result.updated} updated</span>
            <span className="text-muted-foreground">{result.skipped} skipped</span>
          </p>
          {result.report.length > 0 && (
            <div className="grid max-h-40 gap-1 overflow-y-auto pl-1">
              {result.report.map((r, i) => (
                <div key={i} className="flex items-baseline gap-2 text-[11px]">
                  <span className="font-mono text-muted-foreground">{r.key}</span>
                  <span className="text-foreground/80">{r.status}</span>
                  {r.transformed && r.transformed.length > 0 && (
                    <span className="text-muted-foreground/70">
                      {r.transformed.map((t) => `${t.field}: ${t.from} → ${t.to}`).join(', ')}
                    </span>
                  )}
                  {r.why && <span className="text-destructive/80">{r.why}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function GitSection({ projectKey }: { projectKey: string }) {
  const [secret, setSecret] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: () => projectApi.setGitSecret(projectKey, secret.trim() ? secret.trim() : null),
    onSuccess: () => { setSaved(true); setError(null) },
    onError: (e) => setError(e instanceof Error ? e.message : 'Save failed'),
  })

  const webhookUrl = `${window.location.origin}/api/git/webhook/${projectKey}`

  return (
    <section className="mb-6 rounded-lg border bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <GitBranch className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Git integration</h3>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Auto-close issues from commit messages (<code className="text-foreground/70">fixes {projectKey}-42</code>)
        and link pull requests to issues. Point a GitHub/GitLab webhook at the URL below — commits matching
        <code className="text-foreground/70"> fix(es)/close(s)/resolve(s) {projectKey}-N</code> move the issue to Done.
      </p>
      <div className="mb-3 flex flex-col gap-1.5">
        <label className="text-[11px] font-medium text-muted-foreground">Webhook URL</label>
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded-md border bg-background/60 px-2 py-1 text-[11px] text-foreground/80">{webhookUrl}</code>
          <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(webhookUrl) }}>
            Copy
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-medium text-muted-foreground">
          Webhook secret <span className="text-muted-foreground/60">(GitHub: as signing secret · GitLab: as token)</span>
        </label>
        <div className="flex items-center gap-2">
          <Input
            value={secret}
            onChange={(e) => { setSecret(e.target.value); setSaved(false) }}
            placeholder="shared secret — empty clears the integration"
            className="font-mono text-xs"
          />
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
            Save
          </Button>
        </div>
        {saved && <p className="text-[11px] text-emerald-600">Saved. Configure the webhook in your Git host with this secret.</p>}
        {error && <p className="text-[11px] text-destructive">{error}</p>}
      </div>
    </section>
  )
}

function WebhooksSection({ projectKey }: { projectKey: string }) {
  const queryClient = useQueryClient()
  const { data: webhooks, isPending } = useQuery({ queryKey: queryKeys.webhooks(projectKey), queryFn: () => webhookApi.list(projectKey) })
  const [url, setUrl] = useState('')
  const [events, setEvents] = useState<string[]>(['*'])
  const [showSecret, setShowSecret] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: () => webhookApi.create(projectKey, { url: url.trim(), events: events.includes('*') ? [] : events }),
    onSuccess: () => {
      setUrl('')
      setEvents(['*'])
      setErr(null)
      void queryClient.invalidateQueries({ queryKey: queryKeys.webhooks(projectKey) })
    },
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : 'Failed to create webhook'),
  })
  const remove = useMutation({
    mutationFn: (id: string) => webhookApi.remove(projectKey, id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.webhooks(projectKey) }),
  })

  const toggleEvent = (e: string) => {
    if (e === '*') {
      setEvents(events.includes('*') ? [] : ['*'])
      return
    }
    const next = events.filter((x) => x !== '*')
    if (next.includes(e)) setEvents(next.filter((x) => x !== e))
    else setEvents([...next, e])
  }

  return (
    <section className="mb-6 rounded-lg border bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <Webhook className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Webhooks</h3>
        <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">{webhooks?.length ?? 0}</span>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        POST signed event payloads to your URL. Trazer auto-generates a base64 secret used to sign
        each delivery with HMAC-SHA256. Retry queue is not implemented in v1 — if the URL is
        unreachable the event is logged and dropped.
      </p>

      <ul className="mb-4 space-y-1.5">
        {webhooks?.map((w) => (
          <li key={w.id} className="flex items-center gap-2 rounded-md border border-border/40 bg-background/40 px-3 py-2 text-xs">
            <span className="min-w-0 flex-1 truncate font-mono text-foreground/80" title={w.url}>{w.url}</span>
            <span className="rounded bg-muted px-1.5 text-[10px] text-muted-foreground">{w.events || '*'}</span>
            <button
              onClick={() => setShowSecret(showSecret === w.id ? null : w.id)}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              title="Toggle secret"
            >
              <ExternalLink className="size-3" />
            </button>
            <button
              onClick={() => { navigator.clipboard.writeText(w.secret) }}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              title="Copy secret"
            >
              <Copy className="size-3" />
            </button>
            <button
              onClick={() => { if (confirm('Delete this webhook?')) remove.mutate(w.id) }}
              className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              title="Delete webhook"
            >
              <Trash2 className="size-3" />
            </button>
          </li>
        ))}
        {showSecret && (
          <li className="rounded-md border border-dashed border-border/40 bg-background/20 p-2 font-mono text-[10px] text-muted-foreground break-all">
            <span className="select-all">{webhooks?.find((w) => w.id === showSecret)?.secret}</span>
          </li>
        )}
        {!isPending && (webhooks?.length ?? 0) === 0 && (
          <li className="text-xs italic text-muted-foreground/60">No webhooks yet.</li>
        )}
      </ul>

      <div className="grid gap-2 border-t border-border/40 pt-3">
        <div className="grid gap-1.5">
          <label className="text-[11px] text-muted-foreground">Payload URL</label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/hooks/trazer"
            className="h-8 w-full rounded-md border bg-background px-2 text-xs focus:border-primary focus:outline-none"
          />
        </div>
        <div className="grid gap-1.5">
          <label className="text-[11px] text-muted-foreground">Events</label>
          <div className="flex flex-wrap gap-1.5">
            {['*', ...WEBHOOK_EVENTS].map((e) => {
              const isAll = e === '*'
              const active = isAll ? events.includes('*') : (events.includes(e) && !events.includes('*'))
              return (
                <button
                  key={e}
                  onClick={() => toggleEvent(e)}
                  className={cn(
                    'press-pulse rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors',
                    active
                      ? 'border-primary/40 bg-primary/10 text-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  {e}
                </button>
              )
            })}
          </div>
        </div>
        {err && <p className="text-xs text-destructive">{err}</p>}
        <div className="flex justify-end">
          <Button size="sm" disabled={!url.trim() || create.isPending} onClick={() => create.mutate()}>
            {create.isPending && <Loader2 className="mr-1 size-3.5 animate-spin" />}
            <Plus className="mr-1 size-3.5" />
            Add webhook
          </Button>
        </div>
      </div>
    </section>
  )
}
