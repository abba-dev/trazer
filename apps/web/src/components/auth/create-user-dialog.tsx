import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { authApi } from '../../lib/api'
import { queryKeys } from '../../lib/query-keys'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Checkbox } from '../ui/checkbox'

export function CreateUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: () => authApi.createUser({ email, name, password, isAdmin }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.users })
      reset()
      onOpenChange(false)
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not create account'),
  })

  const reset = () => {
    setEmail('')
    setName('')
    setPassword('')
    setIsAdmin(false)
    setError(null)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create account</DialogTitle>
          <DialogDescription>Grant access to a teammate. Only admins can create accounts.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="cu-email">Email</Label>
            <Input id="cu-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoFocus />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cu-name">Name</Label>
            <Input id="cu-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cu-pass">Password</Label>
            <Input id="cu-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={isAdmin} onCheckedChange={(v) => setIsAdmin(v === true)} />
            Admin
          </label>
          {error && <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!email.trim() || !name.trim() || password.length < 8 || create.isPending} onClick={() => create.mutate()}>
            {create.isPending && <Loader2 className="mr-1 size-4 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}