export const queryKeys = {
  projects: ['projects'] as const,
  project: (key: string) => ['project', key] as const,
  issues: (projectKey: string, params?: Record<string, string | undefined>) =>
    ['issues', projectKey, params] as const,
  issue: (projectKey: string, number: number) => ['issue', projectKey, number] as const,
  comments: (projectKey: string, number: number) => ['comments', projectKey, number] as const,
  history: (projectKey: string, number: number) => ['history', projectKey, number] as const,
  attachments: (projectKey: string, number: number) => ['attachments', projectKey, number] as const,
  sprints: (projectKey: string) => ['sprints', projectKey] as const,
  releases: (projectKey: string) => ['releases', projectKey] as const,
  epics: (projectKey: string) => ['epics', projectKey] as const,
  labels: (projectKey: string) => ['labels', projectKey] as const,
  users: ['users'] as const,
  search: (q: string) => ['search', q] as const,
}
