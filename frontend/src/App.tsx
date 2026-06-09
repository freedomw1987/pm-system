import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'

// Pages
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import ProjectsPage from './pages/ProjectsPage'
import ProjectDetailPage from './pages/ProjectDetailPage'
import RequirementDetailPage from './pages/RequirementDetailPage'
import MyRequirementsPage from './pages/MyRequirementsPage'
import MyTasksPage from './pages/MyTasksPage'
import MyBugsPage from './pages/MyBugsPage'
import BugsPage from './pages/BugsPage'
import BugDetailPage from './pages/BugDetailPage'
import WorkLogsPage from './pages/WorkLogsPage'
import ReportsPage from './pages/ReportsPage'
import UsersPage from './pages/UsersPage'
import RolesPage from './pages/RolesPage'
import DepartmentsPage from './pages/DepartmentsPage'
import SettingsPage from './pages/SettingsPage'
import ChatPage from './pages/ChatPage'
import ProfilePage from './pages/ProfilePage'
import WikiPage from './pages/WikiPage'
import AgentsPage from './pages/AgentsPage'

// Layout
import Layout from './components/Layout'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  
  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
    </div>
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  
  return <>{children}</>
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }>
            <Route index element={<DashboardPage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="projects/:id" element={<ProjectDetailPage />} />
            <Route path="requirements/:id" element={<RequirementDetailPage />} />
            <Route path="my-requirements" element={<MyRequirementsPage />} />
            <Route path="my-tasks" element={<MyTasksPage />} />
            <Route path="my-bugs" element={<MyBugsPage />} />
            <Route path="bugs" element={<BugsPage />} />
            <Route path="bugs/:id" element={<BugDetailPage />} />
            <Route path="work-logs" element={<WorkLogsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="roles" element={<RolesPage />} />
            <Route path="departments" element={<DepartmentsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="chat" element={<ChatPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="wiki" element={<WikiPage />} />
            <Route path="wiki/:projectId" element={<WikiPage />} />
            <Route path="agents" element={<AgentsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App