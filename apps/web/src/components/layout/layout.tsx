import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BarChart3,
  Boxes,
  Command,
  ExternalLink,
  LayoutGrid,
  ListTodo,
  Package,
  Plus,
  Search,
  Settings as SettingsIcon,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { issueApi, projectApi, filterApi, authApi, type Issue, type Project, type SavedFilter } from '../../lib/api'
import { queryKeys } from '../../lib/query-keys'
import { useAuth } from '../../lib/auth'
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
  const navigate = useNavigate()
  const location = useLocation()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [userCreateOpen, setUserCreateOpen] = useState(false)
  const queryClient = useQueryClient()

  const { data: projects } = useQuery({ queryKey: queryKeys.projects, queryFn: projectApi.list })
  const { data: filters } = useQuery({ queryKey: queryKeys.filters, queryFn: filterApi.list })
  const { data: config } = useQuery({ queryKey: queryKeys.config, queryFn: authApi.config, staleTime: Infinity })
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
      <Sidebar projects={projects ?? []} filters={filters ?? []} activeKey={projectKey} user={user} isAdmin={!!user?.isAdmin} onCreateUser={() => setUserCreateOpen(true)} onLogout={logout} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          project={projectKey ? projects?.find((p) => p.key === projectKey) : undefined}
          demo={!!config?.demo}
          onOpenPalette={() => setPaletteOpen(true)}
          onCreate={() => setCreateOpen(true)}
        />
        <main key={location.pathname} className="page-enter min-h-0 flex-1 overflow-auto">
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
}: {
  projects: Project[]
  filters: SavedFilter[]
  activeKey?: string
  user: { name: string; email: string; isAdmin?: boolean } | null
  isAdmin: boolean
  onCreateUser: () => void
  onLogout: () => void
}) {
  const queryClient = useQueryClient()
  const location = useLocation()
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex h-14 items-center gap-2 px-4">
        <img src="/icon.png" alt="Trazer" className="size-7" />
        <img src="/trzrtext.png" alt="" className="h-5" />
      </div>

      <div className="flex-1 overflow-y-auto px-2.5 py-4">
        <SidebarSection label="Workspace">
          <SidebarLink to="/projects" icon={Boxes} label="Projects" active={location.pathname === '/projects'} end={false} />
          <SidebarLink to="/search" icon={Search} label="Search" active={location.pathname === '/search'} />
          <SidebarLink to="/dashboards" icon={BarChart3} label="Dashboards" active={location.pathname === '/dashboards'} />
        </SidebarSection>
        {isAdmin && (
          <SidebarSection label="Admin">
            <SidebarLink to="/admin/users" icon={Users} label="Users" end={false} />
            <SidebarLink to="/settings" icon={SettingsIcon} label="Trazer settings" active={location.pathname === '/settings'} />
          </SidebarSection>
        )}
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

      <div className="border-t border-sidebar-border p-2.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/60">
              <Avatar name={user?.name ?? '?'} size={7} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium leading-tight">{user?.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground/80">{user?.email}</span>
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
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
      <p className="px-2.5 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/70">{label}</p>
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
        'group/link relative flex h-7 items-center gap-2 rounded-md px-2.5 text-[13px] transition-colors duration-100',
        active
          ? 'bg-accent/70 font-medium text-foreground'
          : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground',
      )}
    >
      {active && <div className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-primary" aria-hidden />}
      {Icon && <Icon className="size-3.5 shrink-0" />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge != null && badge > 0 && (
        <span className="rounded bg-muted/70 px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground">{badge}</span>
      )}
    </NavLink>
  )
}

function Topbar({ project, demo, onOpenPalette, onCreate }: { project?: Project; demo: boolean; onOpenPalette: () => void; onCreate: () => void }) {
  const { projectKey } = useParams<{ projectKey: string }>()
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border/60 px-4">
      {project ? (
        <div className="flex items-baseline gap-2 min-w-0">
          <h1 className="truncate text-[13.5px] font-semibold tracking-tight">{project.name}</h1>
          <span className="rounded-md border border-border/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] tabular-nums text-muted-foreground">{project.key}</span>
          <Link
            to={`/projects/${projectKey}/settings`}
            className="ml-0.5 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="Project settings"
          >
            <SettingsIcon className="size-3.5" />
          </Link>
        </div>
      ) : (
        <h1 className="flex items-center gap-2 text-[13.5px] font-semibold tracking-tight">
          Trazer
          {demo && (
            <span className="rounded-md border border-border/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">Demo</span>
          )}
        </h1>
      )}

      {projectKey && (
        <nav className="ml-3 flex items-center gap-0.5">
          <TabLink to={`/projects/${projectKey}/board`} icon={LayoutGrid} label="Board" />
          <TabLink to={`/projects/${projectKey}/backlog`} icon={ListTodo} label="Backlog" />
          <TabLink to={`/projects/${projectKey}/sprints`} icon={Command} label="Sprints" />
          <TabLink to={`/projects/${projectKey}/releases`} icon={Package} label="Releases" />
        </nav>
      )}

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={onOpenPalette}
          className="flex h-7 items-center gap-2 rounded-md border border-border/60 bg-secondary/40 px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent/60"
        >
          <Search className="size-3.5" />
          <span className="hidden text-muted-foreground/80 md:inline">Search with TQ</span>
          <kbd className="ml-3 hidden rounded border border-border/60 bg-background/50 px-1.5 py-0.5 font-sans text-[10px] tabular-nums text-muted-foreground/80 md:inline">⌘K</kbd>
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
          'flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium transition-colors duration-100',
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
