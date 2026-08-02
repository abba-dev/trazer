import { useState } from 'react'
import { useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { epicApi, issueApi, labelApi, sprintApi, authApi, PRIORITIES, STATUSES, TYPES, type Label, type Priority, type Status, type Type } from '../../lib/api'
import { queryKeys } from '../../lib/query-keys'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import { Label as LabelInput } from '../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Avatar } from './meta'

export function CreateIssueDialog({
  open,
  onOpenChange,
  defaults,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaults?: Partial<{ type: Type; status: Status; sprintId: string | null; epicId: string | null; onCreated: (key: string) => void }>
}) {
  const { projectKey } = useParams<{ projectKey: string }>()
  const queryClient = useQueryClient()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<Type>(defaults?.type ?? 'Task')
  const [status, setStatus] = useState<Status>(defaults?.status ?? 'ToDo')
  const [priority, setPriority] = useState<Priority>('Medium')
  const [assigneeId, setAssigneeId] = useState<string | null>(null)
  const [epicId, setEpicId] = useState<string | null>(defaults?.epicId ?? null)
  const [sprintId, setSprintId] = useState<string | null>(defaults?.sprintId ?? null)
  const [labelIds, setLabelIds] = useState<string[]>([])
  const [estimate, setEstimate] = useState('')

  const { data: users } = useQuery({ queryKey: queryKeys.users, queryFn: authApi.users })
  const { data: epics } = useQuery({ queryKey: queryKeys.epics(projectKey!), queryFn: () => epicApi.list(projectKey!), enabled: !!projectKey })
  const { data: sprints } = useQuery({ queryKey: queryKeys.sprints(projectKey!), queryFn: () => sprintApi.list(projectKey!), enabled: !!projectKey })
  const { data: labels } = useQuery({ queryKey: queryKeys.labels(projectKey!), queryFn: () => labelApi.list(projectKey!), enabled: !!projectKey })

  const create = useMutation({
    mutationFn: () =>
      issueApi.create(projectKey!, {
        title,
        description: description || null,
        type,
        status,
        priority,
        assigneeId,
        epicId,
        sprintId,
        labelIds,
        estimate: estimate ? Number(estimate) : null,
      }),
    onSuccess: (issue) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.issues(projectKey!) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects })
      void queryClient.invalidateQueries({ queryKey: queryKeys.sprints(projectKey!) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.releases(projectKey!) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.epics(projectKey!) })
      onOpenChange(false)
      reset()
      if (defaults?.onCreated) defaults.onCreated(issue.key)
    },
  })

  const reset = () => {
    setTitle('')
    setDescription('')
    setType(defaults?.type ?? 'Task')
    setStatus(defaults?.status ?? 'ToDo')
    setPriority('Medium')
    setAssigneeId(null)
    setEpicId(defaults?.epicId ?? null)
    setSprintId(defaults?.sprintId ?? null)
    setLabelIds([])
    setEstimate('')
  }

  const toggleLabel = (id: string) => {
    setLabelIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create issue</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <Input
            autoFocus
            placeholder="Issue title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void create.mutate()
            }}
          />
          <Textarea placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />

          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={type} onValueChange={(v) => setType(v as Type)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Priority">
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Assignee">
              <Select value={assigneeId ?? ''} onValueChange={(v) => setAssigneeId(v || null)}>
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Unassigned</SelectItem>
                  {users?.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Epic">
              <Select value={epicId ?? ''} onValueChange={(v) => setEpicId(v || null)}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {epics?.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Sprint">
              <Select value={sprintId ?? ''} onValueChange={(v) => setSprintId(v || null)}>
                <SelectTrigger><SelectValue placeholder="Backlog" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Backlog</SelectItem>
                  {sprints?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}{s.isActive ? ' (active)' : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Estimate">
              <Input type="number" min={0} placeholder="Points" value={estimate} onChange={(e) => setEstimate(e.target.value)} />
            </Field>
          </div>

          <Field label="Labels">
            <div className="flex flex-wrap gap-1.5">
              {labels?.map((l: Label) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => toggleLabel(l.id)}
                  className="rounded-full border px-2.5 py-1 text-xs transition-colors"
                  style={{
                    borderColor: `${l.color}66`,
                    backgroundColor: labelIds.includes(l.id) ? `${l.color}33` : 'transparent',
                  }}
                >
                  {l.name}
                </button>
              ))}
              {(!labels || labels.length === 0) && <span className="text-xs text-muted-foreground">No labels yet</span>}
            </div>
          </Field>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button disabled={!title.trim() || create.isPending} onClick={() => create.mutate()}>
              {create.isPending && <Loader2 className="mr-1 size-4 animate-spin" />}
              Create
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <LabelInput className="text-xs text-muted-foreground">{label}</LabelInput>
      {children}
    </div>
  )
}

export function AssigneeRow({ user }: { user: { id: string; name: string } | null }) {
  return user ? (
    <span className="flex items-center gap-2">
      <Avatar name={user.name} size={6} />
      <span className="text-xs">{user.name}</span>
    </span>
  ) : (
    <span className="text-xs text-muted-foreground">Unassigned</span>
  )
}
