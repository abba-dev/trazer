import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus, X } from 'lucide-react'
import { authApi } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'

function AllowlistSection({
  title,
  hint,
  placeholder,
  items,
  add,
  remove,
}: {
  title: string
  hint: string
  placeholder: string
  items: { id: string; value: string }[] | undefined
  add: (value: string) => void
  remove: (id: string) => void
}) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const v = value.trim()
    if (!v) return
    setError(null)
    add(v)
    setValue('')
  }

  return (
    <section>
      <h3 className="mb-1 text-sm font-semibold">{title}</h3>
      <p className="mb-3 text-xs text-muted-foreground">{hint}</p>
      <form onSubmit={submit} className="mb-3 flex items-end gap-2">
        <div className="grid flex-1 gap-1.5">
          <Label className="sr-only" htmlFor={title}>{title}</Label>
          <Input
            id={title}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <Button type="submit" size="sm" disabled={!value.trim()}>
          <Plus className="mr-1 size-3.5" /> Add
        </Button>
      </form>
      {!items?.length ? (
        <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
          Nothing whitelisted yet.
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border bg-card">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{item.value}</span>
              <button
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
                onClick={() => remove(item.id)}
                title="Remove"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function AdminAllowlistPage() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const domains = useQuery({ queryKey: ['allowed-domains'], queryFn: authApi.allowedDomains })
  const emails = useQuery({ queryKey: ['allowed-emails'], queryFn: authApi.allowedEmails })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['allowed-domains'] })
    void queryClient.invalidateQueries({ queryKey: ['allowed-emails'] })
  }

  const addDomain = useMutation({ mutationFn: authApi.addAllowedDomain, onSuccess: invalidate })
  const removeDomain = useMutation({ mutationFn: authApi.removeAllowedDomain, onSuccess: invalidate })
  const addEmail = useMutation({ mutationFn: authApi.addAllowedEmail, onSuccess: invalidate })
  const removeEmail = useMutation({ mutationFn: authApi.removeAllowedEmail, onSuccess: invalidate })

  if (user && !user.isAdmin) return <Navigate to="/projects" replace />

  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold">OAuth allowlist</h2>
        <span className="text-xs text-muted-foreground">Admin only</span>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        OAuth sign-in is only granted to these emails or domains. The first OAuth login on a fresh
        install (no users yet) becomes the admin automatically.
      </p>
      <div className="grid gap-8">
        <AllowlistSection
          title="Allowed domains"
          hint="Anyone with an email at these domains can sign in with Google or GitHub."
          placeholder="example.com"
          items={domains.data?.map((d) => ({ id: d.id, value: d.domain }))}
          add={(v) => addDomain.mutate(v)}
          remove={(id) => removeDomain.mutate(id)}
        />
        <AllowlistSection
          title="Allowed emails"
          hint="Exact emails that can sign in, even outside the domains above."
          placeholder="you@example.com"
          items={emails.data?.map((e) => ({ id: e.id, value: e.email }))}
          add={(v) => addEmail.mutate(v)}
          remove={(id) => removeEmail.mutate(id)}
        />
      </div>
      {(domains.isPending || emails.isPending) && (
        <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Loading…
        </p>
      )}
    </div>
  )
}
