import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Boxes,
  Command,
  ExternalLink,
  LayoutGrid,
  ListTodo,
  Moon,
  Package,
  Plus,
  Search,
  Sun,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { issueApi, projectApi, filterApi, type Issue, type Project, type SavedFilter } from '../../lib/api'
import { queryKeys } from '../../lib/query-keys'
import { useAuth } from '../../lib/auth'
import { useTheme } from '../../lib/theme'
import { Avatar } from '../issues/meta'
import { cn } from '../../lib/utils'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../ui/dropdown-menu'
import { Button } from '../ui/button'
import { CreateIssueDialog } from '../issues/create-issue-dialog'
import { CreateUserDialog } from '../auth/create-user-dialog'
import { ShortcutsDialog } from './shortcuts-dialog'

export function Layout() {
  const { projectKey } = useParams<{ projectKey: string }>()
  const { user, logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [userCreateOpen, setUserCreateOpen] = useState(false)
  const queryClient = useQueryClient()

  const { data: projects } = useQuery({ queryKey: queryKeys.projects, queryFn: projectApi.list })
  const { data: filters } = useQuery({ queryKey: queryKeys.filters, queryFn: filterApi.list })
  const { data: issues } = useQuery({
    queryKey: queryKeys.issues(projectKey ?? ''),
    queryFn: () => issueApi.list(projectKey!),
    enabled: !!projectKey,
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((open) => !open)
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        setCreateOpen(true)
        return
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return

      switch (e.key) {
        case '?':
          e.preventDefault()
          setHelpOpen(true)
          break
        case 'c':
          e.preventDefault()
          setCreateOpen(true)
          break
        case '/':
          e.preventDefault()
          setPaletteOpen(true)
          break
        case '1':
          if (projectKey) {
            e.preventDefault()
            navigate(`/projects/${projectKey}/backlog`)
          }
          break
        case '2':
          if (projectKey) {
            e.preventDefault()
            navigate(`/projects/${projectKey}/board`)
          }
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [projectKey, navigate])

  const invalidateProject = () => {
    void queryClient.invalidateQueries({ queryKey: ['issues', projectKey] })
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <Sidebar projects={projects ?? []} filters={filters ?? []} activeKey={projectKey} user={user} isAdmin={!!user?.isAdmin} onCreateUser={() => setUserCreateOpen(true)} onLogout={logout} theme={theme} onTheme={setTheme} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          project={projectKey ? projects?.find((p) => p.key === projectKey) : undefined}
          onOpenPalette={() => setPaletteOpen(true)}
          onCreate={() => setCreateOpen(true)}
        />
        <main className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} projects={projects ?? []} issues={issues ?? []} onNavigate={() => setPaletteOpen(false)} />

      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />

      <CreateIssueDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open)
          if (!open) invalidateProject()
        }}
      />

      <CreateUserDialog open={userCreateOpen} onOpenChange={setUserCreateOpen} />
    </div>
  )
}

function Sidebar({
  projects,
  filters,
  activeKey,
  user,
  isAdmin,
  onCreateUser,
  onLogout,
  theme,
  onTheme,
}: {
  projects: Project[]
  filters: SavedFilter[]
  activeKey?: string
  user: { name: string; email: string; isAdmin?: boolean } | null
  isAdmin: boolean
  onCreateUser: () => void
  onLogout: () => void
  theme: string
  onTheme: (t: 'light' | 'dark' | 'system') => void
}) {
  const queryClient = useQueryClient()
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-sidebar">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Zap className="size-4" />
        </span>
        <span className="text-sm font-semibold tracking-tight">Trazer</span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <SidebarSection label="Workspace">
          <SidebarLink to="/projects" icon={Boxes} label="Projects" active />
          <SidebarLink to="/search" icon={Search} label="Search" />
        </SidebarSection>
        {filters.length > 0 && (
          <SidebarSection label="Filters">
            {filters.map((f) => (
              <div key={f.id} className="group relative">
                <Link
                  to={`/search?q=${encodeURIComponent(f.query)}`}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 pr-7 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                  title={`${f.name} — ${f.query}`}
                >
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                </Link>
                <button
                  onClick={() => {
                    void filterApi.remove(f.id).then(() => queryClient.invalidateQueries({ queryKey: queryKeys.filters }))
                  }}
                  className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-destructive group-hover:block"
                  title="Delete filter"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </SidebarSection>
        )}
        <SidebarSection label="Projects">
          {projects?.map((p) => (
            <SidebarLink
              key={p.id}
              to={`/projects/${p.key}/board`}
              icon={null}
              label={p.name}
              badge={p.issueCount}
              active={p.key === activeKey}
              end={false}
            />
          ))}
          <Link
            to="/projects"
            className="mt-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Plus className="size-3.5" /> New project
          </Link>
        </SidebarSection>
      </div>

      <div className="border-t p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent">
              <Avatar name={user?.name ?? '?'} size={7} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{user?.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{user?.email}</span>
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onClick={() => onTheme(theme === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href="https://github.com/abba-dev/trazer" target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" /> GitHub
              </a>
            </DropdownMenuItem>
            {isAdmin && (
              <DropdownMenuItem onClick={onCreateUser}>
                <Plus className="size-4" /> Create user
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onLogout} className="text-destructive focus:text-destructive">
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  )
}

function SidebarSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      {children}
    </div>
  )
}

function SidebarLink({
  to,
  icon: Icon,
  label,
  badge,
  active,
  end = true,
}: {
  to: string
  icon: LucideIcon | null
  label: string
  badge?: number
  active?: boolean
  end?: boolean
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm',
        active ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {Icon && <Icon className="size-4 shrink-0" />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge != null && badge > 0 && (
        <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground">{badge}</span>
      )}
    </NavLink>
  )
}

function Topbar({ project, onOpenPalette, onCreate }: { project?: Project; onOpenPalette: () => void; onCreate: () => void }) {
  const { projectKey } = useParams<{ projectKey: string }>()
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
      {project ? (
        <div className="flex items-baseline gap-2 min-w-0">
          <h1 className="truncate text-sm font-semibold">{project.name}</h1>
          <span className="rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{project.key}</span>
        </div>
      ) : (
        <h1 className="text-sm font-semibold">Trazer</h1>
      )}

      {projectKey && (
        <nav className="ml-4 flex items-center gap-1">
          <TabLink to={`/projects/${projectKey}/board`} icon={LayoutGrid} label="Board" />
          <TabLink to={`/projects/${projectKey}/backlog`} icon={ListTodo} label="Backlog" />
          <TabLink to={`/projects/${projectKey}/sprints`} icon={Command} label="Sprints" />
          <TabLink to={`/projects/${projectKey}/releases`} icon={Package} label="Releases" />
        </nav>
      )}

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={onOpenPalette}
          className="flex items-center gap-2 rounded-md border bg-secondary/50 px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent"
        >
          <Search className="size-3.5" />
          <span className="hidden md:inline">Search with TQ…</span>
          <kbd className="ml-4 hidden rounded border px-1 font-sans text-[10px] md:inline">Ctrl K</kbd>
        </button>
        <Button size="sm" onClick={onCreate}>
          <Plus className="size-4" /> Create
        </Button>
      </div>
    </header>
  )
}

function TabLink({ to, icon: Icon, label }: { to: string; icon: LucideIcon; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
          isActive ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
        )
      }
    >
      <Icon className="size-3.5" />
      {label}
    </NavLink>
  )
}

function CommandPalette({
  open,
  onOpenChange,
  projects,
  issues,
  onNavigate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projects: Project[]
  issues: Issue[]
  onNavigate: () => void
}) {
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const { projectKey } = useParams<{ projectKey: string }>()

  const grouped = useMemo(() => {
    const list = issues.map((issue) => ({ issue, score: issue.title.toLowerCase().includes(query.toLowerCase()) ? 1 : 0 }))
    return list.filter((x) => x.score > 0).slice(0, 8)
  }, [issues, query])

  const handleSelect = (path: string) => {
    navigate(path)
    onNavigate()
    setQuery('')
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search issues, projects… (or use TQ: assignee = me, status in (Done, QA))" value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        {grouped.length > 0 && (
          <CommandGroup heading="Issues">
            {grouped.map(({ issue }) => (
              <CommandItem key={issue.id} value={`issue ${issue.title}`} onSelect={() => handleSelect(`/projects/${projectKey}/board?issue=${issue.key}`)}>
                <span className="mr-2 w-14 shrink-0 font-mono text-xs text-muted-foreground">{issue.key}</span>
                {issue.title}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandGroup heading="Projects">
          {projects.map((p) => (
            <CommandItem key={p.id} value={`project ${p.name}`} onSelect={() => handleSelect(`/projects/${p.key}/board`)}>
              <Boxes className="mr-2 size-4" />
              {p.name}
              <span className="ml-2 text-xs text-muted-foreground">{p.key}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Actions">
          <CommandItem value="new issue" onSelect={() => handleSelect(`/projects/${projectKey}/board?new=1`)}>
            <Plus className="mr-2 size-4" /> Create issue
          </CommandItem>
          <CommandItem value="new project" onSelect={() => handleSelect('/projects')}>
            <Plus className="mr-2 size-4" /> Create project
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
