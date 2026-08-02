import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bookmark, Search } from 'lucide-react'
import { filterApi, searchApi, type Issue } from '../lib/api'
import { queryKeys } from '../lib/query-keys'
import { cn } from '../lib/utils'
import { useListNav } from '../lib/use-list-nav'
import { IssueAvatar, LabelChip, PriorityIcon, StatusBadge, TypeBadge } from '../components/issues/meta'
import { IssuePanel } from '../components/issues/issue-panel'
import { Button } from '../components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'

const SUGGESTIONS = [
  'assignee = me',
  'assignee is empty',
  'status in (Done, QA)',
  'priority = High',
  'label = bug',
  'epic = "UI / UX"',
  'created >= -7d',
  'title ~ render',
  'ORDER BY priority',
  'GAME-1',
]

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const q = searchParams.get('q') ?? ''
  const [input, setInput] = useState(q)
  const inputRef = useRef<HTMLInputElement>(null)
  const [saveOpen, setSaveOpen] = useState(false)
  const queryClient = useQueryClient()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const { data: results, isPending, isError, error } = useQuery({
    queryKey: ['search', q],
    queryFn: () => searchApi.query(q),
    enabled: q.trim().length > 0,
  })

  const openIssue = (issue: Issue) => {
    const next = new URLSearchParams(searchParams)
    next.set('issue', issue.key)
    setSearchParams(next)
  }

  const { selectedIndex, setItemRef } = useListNav({
    items: results ?? [],
    enabled: !isPending && !isError && q.trim().length > 0 && (results?.length ?? 0) > 0,
    onOpen: openIssue,
  })

  const save = useMutation({
    mutationFn: (name: string) => filterApi.create({ name, query: q }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.filters })
      setSaveOpen(false)
    },
  })

  const run = (value: string) => {
    setInput(value)
    const next = new URLSearchParams(searchParams)
    if (value.trim()) next.set('q', value)
    else next.delete('q')
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
            const next = new URLSearchParams(searchParams)
            if (e.target.value.trim()) next.set('q', e.target.value)
            else next.delete('q')
            setSearchParams(next, { replace: true })
          }}
          placeholder="Search with TQ — try: assignee = me, assignee is empty, status in (Done, QA), created >= -7d…"
          className="h-11 w-full rounded-md border bg-card pl-9 pr-3 text-sm outline-none ring-ring placeholder:text-muted-foreground focus:ring-2"
        />
      </div>

      {!q.trim() && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Try these</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => run(s)}
                className="rounded-full border px-3 py-1 font-mono text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {isPending && <p className="mt-6 text-sm text-muted-foreground">Searching…</p>}

      {isError && (
        <p className="mt-6 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error instanceof Error ? error.message : 'Invalid query'}
        </p>
      )}

      {!isPending && !isError && q.trim() && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{results?.length ?? 0} results</p>
            <Button variant="outline" size="sm" onClick={() => setSaveOpen(true)} disabled={isError || (results?.length ?? 0) === 0}>
              <Bookmark className="size-3.5" /> Save filter
            </Button>
          </div>
          {results && results.length > 0 && (
            <ResultsList issues={results} selectedIndex={selectedIndex} setItemRef={setItemRef} onOpen={openIssue} />
          )}
          {results && results.length === 0 && (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No issues match this query.
            </p>
          )}
        </div>
      )}

      <SaveFilterDialog open={saveOpen} onOpenChange={setSaveOpen} onSave={(name) => save.mutate(name)} saving={save.isPending} />

      <IssuePanel />
    </div>
  )
}

function ResultsList({
  issues,
  selectedIndex,
  setItemRef,
  onOpen,
}: {
  issues: Issue[]
  selectedIndex: number
  setItemRef: (index: number) => (el: HTMLElement | null) => void
  onOpen: (issue: Issue) => void
}) {
  return (
    <ul className="overflow-hidden rounded-lg border bg-card">
      {issues.map((issue, idx) => (
        <li key={issue.id}>
          {idx > 0 && <hr className="mx-4 border-t border-border/60" />}
          <button
            ref={setItemRef(idx)}
            onClick={() => onOpen(issue)}
            className={cn('flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-accent/40', selectedIndex === idx && 'bg-accent/40')}
          >
            <span className="w-16 shrink-0 font-mono text-[11px] text-muted-foreground">{issue.key}</span>
            <TypeBadge type={issue.type} />
            <StatusBadge status={issue.status} className="hidden sm:inline-flex" />
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{issue.title}</span>
            {issue.epicName && <span className="hidden text-[11px] text-muted-foreground lg:inline">◈ {issue.epicName}</span>}
            <PriorityIcon priority={issue.priority} />
            {issue.labels.slice(0, 2).map((l) => (
              <LabelChip key={l.id} name={l.name} color={l.color} />
            ))}
            <IssueAvatar issue={issue} />
          </button>
        </li>
      ))}
    </ul>
  )
}

function SaveFilterDialog({
  open,
  onOpenChange,
  onSave,
  saving,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (name: string) => void
  saving: boolean
}) {
  const [name, setName] = useState('')
  const submit = () => {
    if (name.trim()) onSave(name.trim())
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save filter</DialogTitle>
          <DialogDescription>This filter will appear in the sidebar and as a quick filter on the board.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="filter-name">Name</Label>
            <Input
              id="filter-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
              }}
              placeholder="e.g. My bugs"
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!name.trim() || saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
