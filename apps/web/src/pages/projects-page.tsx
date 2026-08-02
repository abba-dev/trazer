import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FolderPlus, Loader2, MoreHorizontal, Pencil, Plus, Trash2, Zap } from 'lucide-react'
import { projectApi, type Project } from '../lib/api'
import { queryKeys } from '../lib/query-keys'
import { Button } from '../components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu'
import { formatDate } from '../lib/api'

export function ProjectsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [key, setKey] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const { data: projects, isPending } = useQuery({ queryKey: queryKeys.projects, queryFn: projectApi.list })

  const create = useMutation({
    mutationFn: () => projectApi.create({ key, name, description: description || undefined }),
    onSuccess: (project) => {
      setCreateOpen(false)
      setKey('')
      setName('')
      setDescription('')
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects })
      navigate(`/projects/${project.key}/board`)
    },
  })

  if (isPending) return <div className="p-8 text-sm text-muted-foreground">Loading projects…</div>

  return (
    <div className="mx-auto max-w-5xl px-6 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Projects</h2>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" /> New project
        </Button>
      </div>

      {projects?.length === 0 && (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <Zap className="mx-auto mb-3 size-8 text-muted-foreground" />
          <p className="text-sm font-medium">No projects yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Create your first project to start tracking issues.</p>
          <Button className="mt-4" onClick={() => setCreateOpen(true)}>
            <FolderPlus className="mr-1 size-4" /> Create project
          </Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {projects?.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <label className="text-xs text-muted-foreground">Key</label>
                <Input
                  placeholder="KEY"
                  maxLength={10}
                  className="uppercase"
                  value={key}
                  onChange={(e) => setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                />
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs text-muted-foreground">Name</label>
                <Input placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs text-muted-foreground">Description</label>
              <Textarea rows={3} placeholder="What is this project about?" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="flex justify-end">
              <Button
                disabled={!key.trim() || !name.trim() || create.isPending}
                onClick={() => create.mutate()}
              >
                {create.isPending && <Loader2 className="mr-1 size-4 animate-spin" />}
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ProjectCard({ project }: { project: Project }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description ?? '')

  const remove = useMutation({
    mutationFn: () => projectApi.remove(project.key),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.projects }),
  })
  const save = useMutation({
    mutationFn: () => projectApi.update(project.key, { name, description: description || undefined }),
    onSuccess: () => {
      setEditing(false)
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects })
    },
  })

  return (
    <article className="flex flex-col rounded-lg border bg-card p-4 transition-shadow hover:shadow">
      <div className="mb-3 flex items-start justify-between">
        <button
          className="flex min-w-0 items-center gap-3 text-left"
          onClick={() => navigate(`/projects/${project.key}/board`)}
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary font-mono text-xs font-bold text-primary-foreground">
            {project.key}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold hover:underline">{project.name}</span>
            <span className="text-xs text-muted-foreground">{project.issueCount} issues</span>
          </span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditing(true)}>
              <Pencil className="mr-2 size-4" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => {
                if (confirm(`Delete project ${project.key}? This cannot be undone.`)) remove.mutate()
              }}
            >
              <Trash2 className="mr-2 size-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <p className="mb-4 line-clamp-3 flex-1 text-xs text-muted-foreground">
        {project.description || 'No description.'}
      </p>

      <div className="flex items-center justify-between border-t pt-3 text-[11px] text-muted-foreground">
        <span>Created {formatDate(project.createdAt)}</span>
        <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => navigate(`/projects/${project.key}/board`)}>
          Open board →
        </Button>
      </div>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit {project.key}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" />
            <div className="flex justify-end">
              <Button disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>
                {save.isPending && <Loader2 className="mr-1 size-4 animate-spin" />}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </article>
  )
}
