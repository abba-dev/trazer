import type { Issue } from './api'

// ponytail: registry pattern. Add a new field = one entry in trazeFilterPlugins.

export type TrazeField = 'status' | 'priority' | 'type' | 'assignee'

export type TrazeFilterPlugin = {
  id: TrazeField
  label: string
  options: (issues: Issue[]) => string[]
  renderValue?: (v: string, issues: Issue[]) => string
}

export const trazeFilterPlugins: Record<TrazeField, TrazeFilterPlugin> = {
  status: {
    id: 'status',
    label: 'Status',
    options: () => ['ToDo', 'InProgress', 'InReview', 'QA', 'Done'],
  },
  priority: {
    id: 'priority',
    label: 'Priority',
    options: () => ['Urgent', 'High', 'Medium', 'Low'],
  },
  type: {
    id: 'type',
    label: 'Type',
    options: () => ['Bug', 'Story', 'Task'],
  },
  assignee: {
    id: 'assignee',
    label: 'Assignee',
    options: (issues) => {
      const set = new Set<string>()
      for (const i of issues) set.add(i.assignee?.name ?? 'Unassigned')
      return [...set].sort()
    },
  },
}

export type TrazeCriteria = Record<TrazeField, string[]>

const EMPTY_CRITERIA: TrazeCriteria = { status: [], priority: [], type: [], assignee: [] }

export function emptyCriteria(): TrazeCriteria {
  return { ...EMPTY_CRITERIA }
}

function quote(v: string): string {
  return /[\s"]/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v
}

export function criteriaToTq(c: TrazeCriteria, projectKey: string): string {
  const parts: string[] = [`project = ${projectKey}`]
  for (const field of Object.keys(trazeFilterPlugins) as TrazeField[]) {
    const values = c[field]
    if (values.length === 0) continue
    if (values.length === 1) {
      parts.push(`${field} = ${quote(values[0])}`)
    } else {
      parts.push(`${field} in (${values.map(quote).join(', ')})`)
    }
  }
  return parts.join(' AND ')
}

export function applyCriteriaClient(issues: Issue[], c: TrazeCriteria): Issue[] {
  return issues.filter((i) => {
    if (c.status.length && !c.status.includes(i.status)) return false
    if (c.priority.length && !c.priority.includes(i.priority)) return false
    if (c.type.length && !c.type.includes(i.type)) return false
    if (c.assignee.length) {
      const name = i.assignee?.name ?? 'Unassigned'
      if (!c.assignee.includes(name)) return false
    }
    return true
  })
}

export type TrazeMetric = {
  id: string
  label: string
  compute: (issues: Issue[]) => { label: string; value: string | number }[]
}

const STATUS_ORDER = ['ToDo', 'InProgress', 'InReview', 'QA', 'Done']
const PRIORITY_ORDER = ['Urgent', 'High', 'Medium', 'Low']
const TYPE_ORDER = ['Bug', 'Story', 'Task']

function group<T>(issues: Issue[], key: (i: Issue) => string, order?: string[]): { label: string; value: number }[] {
  const map = new Map<string, number>()
  for (const i of issues) {
    const k = key(i)
    map.set(k, (map.get(k) ?? 0) + 1)
  }
  const keys = order ? order.filter((k) => map.has(k)) : [...map.keys()]
  return keys.map((k) => ({ label: k, value: map.get(k)! }))
}

export const trazeMetricPlugins: Record<string, TrazeMetric> = {
  count: {
    id: 'count',
    label: 'Total',
    compute: (issues) => [{ label: 'Issues', value: issues.length }],
  },
  byStatus: {
    id: 'byStatus',
    label: 'By status',
    compute: (issues) => group(issues, (i) => i.status, STATUS_ORDER),
  },
  byPriority: {
    id: 'byPriority',
    label: 'By priority',
    compute: (issues) => group(issues, (i) => i.priority, PRIORITY_ORDER),
  },
  byAssignee: {
    id: 'byAssignee',
    label: 'By assignee',
    compute: (issues) =>
      group(issues, (i) => i.assignee?.name ?? 'Unassigned')
        .sort((a, b) => b.value - a.value)
        .slice(0, 8),
  },
  byType: {
    id: 'byType',
    label: 'By type',
    compute: (issues) => group(issues, (i) => i.type, TYPE_ORDER),
  },
  sumEstimate: {
    id: 'sumEstimate',
    label: 'Estimate',
    compute: (issues) => [
      { label: 'Points', value: issues.reduce((s, i) => s + (i.estimate ?? 0), 0) },
    ],
  },
}

export const trazeMetricList = Object.values(trazeMetricPlugins)
export const DEFAULT_METRICS = ['count', 'byStatus', 'byPriority', 'byAssignee']

export const COMMON_TQ_FILTERS: Record<string, { label: string; query: string }> = {
  'my-open': { label: 'My open', query: 'assignee = me AND status != Done' },
  'my-issues': { label: 'My issues', query: 'assignee = me' },
  'bugs': { label: 'Bugs', query: 'type = Bug' },
  'unassigned': { label: 'Unassigned', query: 'assignee is empty' },
  'recent': { label: 'Recently updated', query: 'updated >= -7d' },
  'high-priority': { label: 'High priority', query: 'priority in (High, Urgent)' },
  'this-week': { label: 'Created this week', query: 'created >= -7d' },
}
