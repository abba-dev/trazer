export type User = { id: string; email: string; name: string; isAdmin: boolean; disabled: boolean }
export type Label = { id: string; name: string; color: string }
export type Epic = { id: string; name: string; summary: string | null; color: string; issueCount: number }
export type Sprint = { id: string; name: string; goal: string | null; startDate: string | null; endDate: string | null; isActive: boolean; issueCount: number }
export type Release = { id: string; name: string; description: string | null; status: 'Open' | 'Released'; releasedAt: string | null; issueCount: number }
export type Comment = { id: string; body: string; author: User; createdAt: string }
export type HistoryEntry = { id: string; field: string; oldValue: string | null; newValue: string | null; actor: User; createdAt: string }
export type Attachment = { id: string; fileName: string; contentType: string; size: number; uploadedBy: User; uploadedAt: string }

export type Issue = {
  id: string
  key: string
  number: number
  title: string
  description: string | null
  type: 'Task' | 'Bug' | 'Story'
  status: 'ToDo' | 'InProgress' | 'InReview' | 'QA' | 'Done'
  priority: 'Low' | 'Medium' | 'High' | 'Urgent'
  assigneeId: string | null
  assignee: User | null
  reporter: User
  epicId: string | null
  epicName: string | null
  sprintId: string | null
  sprintName: string | null
  releaseId: string | null
  releaseName: string | null
  labels: Label[]
  estimate: number | null
  pullRequestUrl: string | null
  pullRequestState: string | null
  position: number
  createdAt: string
  updatedAt: string
}

export type Project = {
  id: string
  key: string
  name: string
  description: string | null
  issueCount: number
  wipLimits: string | null
  createdAt: string
}

export type SavedFilter = {
  id: string
  name: string
  query: string
  createdAt: string
}

export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export const STATUSES = ['ToDo', 'InProgress', 'InReview', 'QA', 'Done'] as const
export type Status = (typeof STATUSES)[number]
export const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'] as const
export type Priority = (typeof PRIORITIES)[number]
export const TYPES = ['Task', 'Bug', 'Story'] as const
export type Type = (typeof TYPES)[number]

const TOKEN_KEY = 'trazer-token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(`/api${path}`, { ...options, headers })

  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const body = await response.json()
      if (body?.error?.message) message = body.error.message
    } catch {
      /* ignore */
    }
    throw new ApiError(response.status, '', message)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),

  async upload<T>(path: string, file: File): Promise<T> {
    const form = new FormData()
    form.append('file', file)
    const token = getToken()
    const response = await fetch(`/api${path}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    })
    if (!response.ok) throw new ApiError(response.status, '', 'Upload failed')
    return (await response.json()) as T
  },
}

export type AppConfig = { demo: boolean; demoEmail: string; setupRequired: boolean }

export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ token: string; user: User }>('/auth/login', { email, password }),
  demoLogin: () => api.post<{ token: string; user: User }>('/auth/demo-login'),
  bootstrapAdmin: (data: { email: string; name: string; password: string }) =>
    api.post<{ token: string; user: User }>('/auth/admin', data),
  config: () => api.get<AppConfig>('/config'),
  me: () => api.get<User>('/auth/me'),
  users: () => api.get<User[]>('/auth/users'),
  createUser: (data: { email: string; name: string; password: string; isAdmin?: boolean }) =>
    api.post<User>('/auth/users', data),
  updateUser: (id: string, data: { disabled?: boolean; password?: string }) =>
    api.patch<User>(`/auth/users/${id}`, data),
}

export const projectApi = {
  list: () => api.get<Project[]>('/projects'),
  create: (data: { key: string; name: string; description?: string }) =>
    api.post<Project>('/projects', data),
  get: (key: string) => api.get<Project>(`/projects/${key}`),
  update: (key: string, data: { name?: string; description?: string; wipLimits?: string | null }) =>
    api.patch<Project>(`/projects/${key}`, data),
  setGitSecret: (key: string, secret: string | null) =>
    api.put<unknown>(`/projects/${key}/git-secret`, { secret }),
  export: (key: string, format: 'json' | 'csv') => {
    const token = getToken()
    const url = `/api/projects/${key}/export?format=${format}`
    return fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  },
  importJira: async (projectKey: string, file: File) => {
    const token = getToken()
    const response = await fetch(`/api/projects/${projectKey}/import/jira`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: await file.text(),
    })
    if (!response.ok) throw new ApiError(response.status, '', 'Import failed')
    return response.json() as Promise<ImportReport>
  },
  importGithub: async (projectKey: string, file: File) => {
    const token = getToken()
    const response = await fetch(`/api/projects/${projectKey}/import/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/csv',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: await file.text(),
    })
    if (!response.ok) throw new ApiError(response.status, '', 'Import failed')
    return response.json() as Promise<ImportReport>
  },
  remove: (key: string) => api.delete(`/projects/${key}`),
}

export const issueApi = {
  list: (projectKey: string, params: Record<string, string | undefined> = {}) => {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v)
    const suffix = qs.size > 0 ? `?${qs}` : ''
    return api.get<Issue[]>(`/projects/${projectKey}/issues${suffix}`)
  },
  get: (projectKey: string, number: number) =>
    api.get<Issue>(`/projects/${projectKey}/issues/${number}`),
  create: (projectKey: string, data: Record<string, unknown> & { title: string }) =>
    api.post<Issue>(`/projects/${projectKey}/issues`, data),
  update: (projectKey: string, number: number, data: Record<string, unknown>) =>
    api.patch<Issue>(`/projects/${projectKey}/issues/${number}`, data),
  remove: (projectKey: string, number: number) =>
    api.delete(`/projects/${projectKey}/issues/${number}`),
  comments: (projectKey: string, number: number) =>
    api.get<Comment[]>(`/projects/${projectKey}/issues/${number}/comments`),
  addComment: (projectKey: string, number: number, body: string) =>
    api.post<Comment>(`/projects/${projectKey}/issues/${number}/comments`, { body }),
  removeComment: (projectKey: string, number: number, commentId: string) =>
    api.delete(`/projects/${projectKey}/issues/${number}/comments/${commentId}`),
  history: (projectKey: string, number: number) =>
    api.get<HistoryEntry[]>(`/projects/${projectKey}/issues/${number}/history`),
  attachments: (projectKey: string, number: number) =>
    api.get<Attachment[]>(`/projects/${projectKey}/issues/${number}/attachments`),
  upload: (projectKey: string, number: number, file: File) =>
    api.upload<Attachment[]>(`/projects/${projectKey}/issues/${number}/attachments`, file),
  removeAttachment: (projectKey: string, number: number, attachmentId: string) =>
    api.delete(`/projects/${projectKey}/issues/${number}/attachments/${attachmentId}`),
  downloadUrl: (projectKey: string, number: number, attachmentId: string) =>
    `/api/projects/${projectKey}/issues/${number}/attachments/${attachmentId}`,
  addLabel: (projectKey: string, number: number, labelId: string) =>
    api.post(`/projects/${projectKey}/labels/${number}/${labelId}`),
  removeLabel: (projectKey: string, number: number, labelId: string) =>
    api.delete(`/projects/${projectKey}/labels/${number}/${labelId}`),
}

export const sprintApi = {
  list: (projectKey: string) => api.get<Sprint[]>(`/projects/${projectKey}/sprints`),
  create: (projectKey: string, data: { name: string; goal?: string; startDate?: string; endDate?: string }) =>
    api.post<Sprint>(`/projects/${projectKey}/sprints`, data),
  update: (projectKey: string, id: string, data: Record<string, unknown>) =>
    api.patch<Sprint>(`/projects/${projectKey}/sprints/${id}`, data),
  remove: (projectKey: string, id: string) => api.delete(`/projects/${projectKey}/sprints/${id}`),
  assignIssues: (projectKey: string, id: string, issueIds: string[]) =>
    api.post(`/projects/${projectKey}/sprints/${id}/issues`, { issueIds }),
}

export const releaseApi = {
  list: (projectKey: string) => api.get<Release[]>(`/projects/${projectKey}/releases`),
  create: (projectKey: string, data: { name: string; description?: string }) =>
    api.post<Release>(`/projects/${projectKey}/releases`, data),
  update: (projectKey: string, id: string, data: Record<string, unknown>) =>
    api.patch<Release>(`/projects/${projectKey}/releases/${id}`, data),
  remove: (projectKey: string, id: string) => api.delete(`/projects/${projectKey}/releases/${id}`),
  assignIssues: (projectKey: string, id: string, issueIds: string[]) =>
    api.post(`/projects/${projectKey}/releases/${id}/issues`, { issueIds }),
}

export const epicApi = {
  list: (projectKey: string) => api.get<Epic[]>(`/projects/${projectKey}/epics`),
  create: (projectKey: string, data: { name: string; summary?: string; color?: string }) =>
    api.post<Epic>(`/projects/${projectKey}/epics`, data),
  update: (projectKey: string, id: string, data: Record<string, unknown>) =>
    api.patch<Epic>(`/projects/${projectKey}/epics/${id}`, data),
  remove: (projectKey: string, id: string) => api.delete(`/projects/${projectKey}/epics/${id}`),
}

export const labelApi = {
  list: (projectKey: string) => api.get<Label[]>(`/projects/${projectKey}/labels`),
  create: (projectKey: string, data: { name: string; color?: string }) =>
    api.post<Label>(`/projects/${projectKey}/labels`, data),
  remove: (projectKey: string, id: string) => api.delete(`/projects/${projectKey}/labels/${id}`),
}

export const searchApi = {
  query: (q: string) => api.get<Issue[]>(`/search?q=${encodeURIComponent(q)}`),
}

export const filterApi = {
  list: () => api.get<SavedFilter[]>('/filters'),
  create: (data: { name: string; query: string }) => api.post<SavedFilter>('/filters', data),
  update: (id: string, data: { name?: string; query?: string }) => api.patch<SavedFilter>(`/filters/${id}`, data),
  remove: (id: string) => api.delete(`/filters/${id}`),
}

export type Webhook = { id: string; url: string; events: string; secret: string; createdAt: string }

export type ImportReport = {
  created: number
  updated: number
  skipped: number
  report: { key: string; status: 'created' | 'updated' | 'skipped'; why?: string; transformed?: { field: string; from: string; to: string }[] }[]
}

export const webhookApi = {
  list: (projectKey: string) => api.get<Webhook[]>(`/projects/${projectKey}/webhooks`),
  create: (projectKey: string, data: { url: string; events?: string[] }) =>
    api.post<Webhook>(`/projects/${projectKey}/webhooks`, data),
  remove: (projectKey: string, id: string) => api.delete(`/projects/${projectKey}/webhooks/${id}`),
}

export function formatKey(projectKey: string, number: number): string {
  return `${projectKey}-${number}`
}

export function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
}

export function formatDate(date: string | null): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}
