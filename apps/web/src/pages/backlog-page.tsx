import { useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Columns3, Loader2, Settings2 } from 'lucide-react'
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

const ALL_COLUMNS: { key: ColKey; label: string; width: string }[] = [
  { key: 'key', label: 'Key', width: 'w-[90px]' },
  { key: 'title', label: 'Title', width: 'flex-1 min-w-0' },
  { key: 'type', label: 'Type', width: 'w-[80px]' },
  { key: 'status', label: 'Status', width: 'w-[110px]' },
  { key: 'priority', label: 'Pri', width: 'w-[40px]' },
  { key: 'assignee', label: 'Assignee', width: 'w-[44px]' },
  { key: 'estimate', label: 'Est', width: 'w-[44px]' },
  { key: 'sprint', label: 'Sprint', width: 'w-[120px]' },
  { key: 'epic', label: 'Epic', width: 'w-[120px]' },
  { key: 'labels', label: 'Labels', width: 'w-[140px]' },
  { key: 'created', label: 'Created', width: 'w-[90px]' },
  { key: 'updated', label: 'Updated', width: 'w-[90px]' },
]

const DEFAULT_VISIBLE: ColKey[] = ['key', 'title', 'type', 'status', 'priority', 'assignee', 'estimate', 'sprint', 'labels', 'updated']
const STORAGE_KEY = 'trazer.issuelist.columns'

export function BacklogPage() {
  const { projectKey } = useParams<{ projectKey: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()

  const [criteria, setCriteria] = useState<TrazeCriteria>(emptyCriteria)
  const [commonFilter, setCommonFilter] = useState<string | null>(null)
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const arr = JSON.parse(raw) as ColKey[]
        if (Array.isArray(arr) && arr.every((c) => ALL_COLUMNS.some((a) => a.key === c))) return new Set(arr)
      }
    } catch {
      /* ignore */
    }
    return new Set(DEFAULT_VISIBLE)
  })

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

  const toggleCol = (k: ColKey) => {
    setVisibleCols((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
      } catch {
        /* ignore */
      }
      return next
    })
  }

  const resetCols = () => {
    setVisibleCols(new Set(DEFAULT_VISIBLE))
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_VISIBLE))
    } catch {
      /* ignore */
    }
  }

  const showCol = (k: ColKey) => visibleCols.has(k)
  const visibleColList = ALL_COLUMNS.filter((c) => showCol(c.key))

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
                  'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                  commonFilter === id ? 'border-primary/40 bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                {f.label}
              </button>
            ))}
            <ColumnsMenu visibleCols={visibleCols} onToggle={toggleCol} onReset={resetCols} />
          </div>
        </div>
        <TrazeFilterBar issues={issues ?? []} criteria={criteria} onChange={setCriteria} />
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="min-w-max">
          <div className={cn('sticky top-0 z-10 flex items-center gap-3 border-b bg-card/95 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur', visibleCols.has('title') && 'min-w-0')}>
            {visibleColList.map((c) => (
              <div key={c.key} className={c.width}>{c.label}</div>
            ))}
          </div>
          {sorted.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm text-muted-foreground">No issues match these filters.</p>
          ) : (
            <ul>
              {sorted.map((issue, idx) => {
                const isSelected = selectedIndex === idx
                return (
                  <li key={issue.id}>
                    {idx > 0 && <hr className="mx-3 border-t border-border/40" />}
                    <div
                      ref={setItemRef(idx)}
                      onClick={() => openIssue(issue)}
                      className={cn(
                        'flex w-full cursor-pointer items-center gap-3 px-3 py-1.5 text-left transition-colors hover:bg-accent/40',
                        isSelected && 'bg-accent/60',
                      )}
                    >
                      {showCol('key') && <span className="w-[90px] shrink-0 font-mono text-[11px] text-muted-foreground">{issue.key}</span>}
                      {showCol('title') && <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{issue.title}</span>}
                      {showCol('type') && <div className="w-[80px] shrink-0"><TypeBadge type={issue.type} /></div>}
                      {showCol('status') && <div className="w-[110px] shrink-0"><StatusBadge status={issue.status} /></div>}
                      {showCol('priority') && <div className="w-[40px] shrink-0"><PriorityIcon priority={issue.priority} /></div>}
                      {showCol('assignee') && <div className="w-[44px] shrink-0">{issue.assignee ? <IssueAvatar issue={issue} /> : <span className="text-muted-foreground/40">—</span>}</div>}
                      {showCol('estimate') && <span className="w-[44px] shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{issue.estimate ?? ''}</span>}
                      {showCol('sprint') && <span className="w-[120px] shrink-0 truncate text-[11px] text-muted-foreground">{issue.sprintName ?? '—'}</span>}
                      {showCol('epic') && <span className="w-[120px] shrink-0 truncate text-[11px] text-muted-foreground">{issue.epicName ? `◈ ${issue.epicName}` : ''}</span>}
                      {showCol('labels') && (
                        <div className="flex w-[140px] shrink-0 gap-1 overflow-hidden">
                          {issue.labels.slice(0, 2).map((l) => <LabelChip key={l.id} name={l.name} color={l.color} />)}
                          {issue.labels.length > 2 && <span className="text-[10px] text-muted-foreground">+{issue.labels.length - 2}</span>}
                        </div>
                      )}
                      {showCol('created') && <span className="w-[90px] shrink-0 text-[11px] text-muted-foreground">{timeAgo(issue.createdAt)}</span>}
                      {showCol('updated') && <span className="w-[90px] shrink-0 text-[11px] text-muted-foreground">{timeAgo(issue.updatedAt)}</span>}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      <IssuePanel />
    </div>
  )
}

function ColumnsMenu({
  visibleCols,
  onToggle,
  onReset,
}: {
  visibleCols: Set<ColKey>
  onToggle: (k: ColKey) => void
  onReset: () => void
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground" title="Columns">
          <Columns3 className="size-3.5" /> Columns
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 p-2">
        <div className="flex items-center justify-between px-2 pb-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Columns</p>
          <button onClick={onReset} className="text-[10px] text-muted-foreground hover:text-foreground">Reset</button>
        </div>
        {ALL_COLUMNS.map((c) => {
          const on = visibleCols.has(c.key)
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
