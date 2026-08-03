import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Settings as SettingsIcon, Trash2, Users } from 'lucide-react'
import { issueApi, projectApi, authApi } from '../lib/api'
import { queryKeys } from '../lib/query-keys'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import { useNavigate } from 'react-router'

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
