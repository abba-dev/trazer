import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { AuthProvider, useAuth } from './lib/auth'
import { ThemeProvider } from './lib/theme'
import { Layout } from './components/layout/layout'
import { LoginPage } from './pages/login-page'
import { ProjectsPage } from './pages/projects-page'
import { BoardPage } from './pages/board-page'
import { BacklogPage } from './pages/backlog-page'
import { SprintsPage } from './pages/sprints-page'
import { ReleasesPage } from './pages/releases-page'
import { SearchPage } from './pages/search-page'
import { AdminUsersPage } from './pages/admin-users-page'
import { AdminAllowlistPage } from './pages/admin-allowlist-page'
import { Loader2 } from 'lucide-react'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

function RequireAuth() {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}

function ScrollToTop() {
  const { pathname, search } = useLocation()
  useEffect(() => {
    if (!search.includes('issue=')) window.scrollTo(0, 0)
  }, [pathname, search])
  return null
}

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <ScrollToTop />
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<RequireAuth />}>
                <Route element={<Layout />}>
                  <Route path="/" element={<Navigate to="/projects" replace />} />
                  <Route path="/projects" element={<ProjectsPage />} />
                  <Route path="/search" element={<SearchPage />} />
                  <Route path="/admin/users" element={<AdminUsersPage />} />
                  <Route path="/admin/allowlist" element={<AdminAllowlistPage />} />
                  <Route path="/projects/:projectKey/board" element={<BoardPage />} />
                  <Route path="/projects/:projectKey/backlog" element={<BacklogPage />} />
                  <Route path="/projects/:projectKey/sprints" element={<SprintsPage />} />
                  <Route path="/projects/:projectKey/releases" element={<ReleasesPage />} />
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/projects" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
