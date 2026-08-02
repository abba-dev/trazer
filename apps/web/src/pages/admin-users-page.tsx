import { useState } from 'react'
import { Navigate } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, ShieldCheck, ShieldOff } from 'lucide-react'
import { authApi, type User } from '../lib/api'
import { queryKeys } from '../lib/query-keys'
import { useAuth } from '../lib/auth'
import { cn } from '../lib/utils'
import { Button } from '../components/ui/button'
import { Avatar } from '../components/issues/meta'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'

export function AdminUsersPage() {
  const queryClient = useQueryClient()
  const { user: me } = useAuth()
  const { data: users } = useQuery({ queryKey: queryKeys.users, queryFn: authApi.users })
  const [resetFor, setResetFor] = useState<User | null>(null)

  if (me && !me.isAdmin) return <Navigate to="/projects" replace />

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { disabled?: boolean; password?: string } }) =>
      authApi.updateUser(id, body),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.users }),
  })

  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Users</h2>
        <span className="text-xs text-muted-foreground">Admin only</span>
      </div>
      <ul className="overflow-hidden rounded-lg border bg-card">
        {users?.map((u, idx) => (
          <li key={u.id}>
            {idx > 0 && <hr className="mx-4 border-t border-border/60" />}
            <div className="flex items-center gap-3 px-4 py-3">
              <Avatar name={u.name} size={7} />
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  {u.name}
                  {u.isAdmin && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                      <ShieldCheck className="size-2.5" /> Admin
                    </span>
                  )}
                  {u.disabled && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <ShieldOff className="size-2.5" /> Disabled
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">{u.email}</p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setResetFor(u)} disabled={u.id === me?.id}>
                  Reset password
                </Button>
                <Button
                  variant={u.disabled ? 'outline' : 'ghost'}
                  size="sm"
                  className={cn(u.disabled ? '' : 'text-destructive hover:bg-destructive/10 hover:text-destructive')}
                  disabled={u.id === me?.id || update.isPending}
                  onClick={() => update.mutate({ id: u.id, body: { disabled: !u.disabled } })}
                >
                  {u.disabled ? 'Enable' : 'Disable'}
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <ResetPasswordDialog
        user={resetFor}
        onClose={() => setResetFor(null)}
        onSave={(password) => {
          update.mutate(
            { id: resetFor!.id, body: { password } },
            { onSuccess: () => setResetFor(null) },
          )
        }}
        saving={update.isPending}
      />
    </div>
  )
}

function ResetPasswordDialog({
  user,
  onClose,
  onSave,
  saving,
}: {
  user: User | null
  onClose: () => void
  onSave: (password: string) => void
  saving: boolean
}) {
  const [password, setPassword] = useState('')
  return (
    <Dialog open={!!user} onOpenChange={(open) => { if (!open) { setPassword(''); onClose() } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>Set a new password for {user?.name}. The user must sign in again with it.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5 py-2">
          <Label htmlFor="rp-pass">New password</Label>
          <Input
            id="rp-pass"
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={password.length < 8 || saving} onClick={() => onSave(password)}>
            {saving && <Loader2 className="mr-1 size-4 animate-spin" />}
            Reset
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}