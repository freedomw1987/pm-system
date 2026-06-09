import axios from 'axios'
import { createRefreshTokenManager } from './authRefresh'

const API_URL = import.meta.env.VITE_API_URL || '/api'
const AUTH_URL = import.meta.env.VITE_AUTH_URL || '/auth'

const clearAuthStorage = () => {
  localStorage.removeItem('accessToken')
  localStorage.removeItem('refreshToken')
  localStorage.removeItem('user')
}

const refreshTokenManager = createRefreshTokenManager({
  getRefreshToken: () => localStorage.getItem('refreshToken'),
  refresh: async (refreshToken) => {
    const response = await axios.post(`${AUTH_URL}/refresh`, { refreshToken })
    return response.data
  },
  setTokens: (response) => {
    localStorage.setItem('accessToken', response.accessToken)
    localStorage.setItem('refreshToken', response.refreshToken)
    if (response.user) {
      localStorage.setItem('user', JSON.stringify(response.user))
    }
  },
  clearTokens: clearAuthStorage,
})

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401 && !error.config?._retry) {
      error.config._retry = true

      try {
        const accessToken = await refreshTokenManager.refreshAccessToken()
        error.config.headers = error.config.headers || {}
        error.config.headers.Authorization = `Bearer ${accessToken}`
        return api(error.config)
      } catch {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default api

// Auth API (public, outside /api prefix) - use axios directly
export const authApi = {
  login: (email: string, password: string) =>
    axios.post(`${AUTH_URL}/login`, { email, password }),
  logout: () => axios.post(`${AUTH_URL}/logout`),
  refresh: (refreshToken: string) =>
    axios.post(`${AUTH_URL}/refresh`, { refreshToken }),
}

// User API
export const userApi = {
  list: (params?: { departmentId?: string; page?: number; pageSize?: number; limit?: number }) =>
    api.get('/users', params ? { params } : undefined),
  listSimple: () => api.get('/users/list'),
  create: (data: { email: string; name: string; password: string; role?: string; departmentId?: string }) =>
    api.post('/users', data),
  get: (id: string) => api.get(`/users/${id}`),
  update: (id: string, data: { name?: string; email?: string; password?: string; role?: string; departmentId?: string | null }) =>
    api.put(`/users/${id}`, data),
  delete: (id: string) => api.delete(`/users/${id}`),
}

// Role and Permission API
export const roleApi = {
  list: () => api.get('/roles'),
  create: (data: { name: string; description?: string; permissions: string[] }) =>
    api.post('/roles', data),
  update: (id: string, data: { name?: string; description?: string | null; permissions?: string[] }) =>
    api.put(`/roles/${id}`, data),
  delete: (id: string) => api.delete(`/roles/${id}`),
  permissions: () => api.get('/roles/permissions'),
}

// Department API
export const departmentApi = {
  list: () => api.get('/departments'),
  create: (data: { name: string }) => api.post('/departments', data),
  update: (id: string, data: { name?: string }) => api.put(`/departments/${id}`, data),
  delete: (id: string) => api.delete(`/departments/${id}`),
}

// Project API
export const projectApi = {
  list: (params?: { departmentId?: string; page?: number; pageSize?: number; limit?: number }) =>
    api.get('/projects', params ? { params } : undefined),
  create: (data: { name: string; description?: string; departmentId?: string }) =>
    api.post('/projects', data),
  get: (id: string) => api.get(`/projects/${id}`),
  update: (id: string, data: { name?: string; description?: string; status?: string; departmentId?: string }) =>
    api.put(`/projects/${id}`, data),
  delete: (id: string) => api.delete(`/projects/${id}`),
  getMembers: (id: string) => api.get(`/projects/${id}/members`),
  addMember: (id: string, data: { userId: string; role: string }) =>
    api.post(`/projects/${id}/members`, data),
  updateMemberRole: (memberId: string, role: string) =>
    api.patch(`/projects/members/${memberId}`, { role }),
  removeMember: (memberId: string) =>
    api.delete(`/projects/members/${memberId}`),
}

// Requirement API
export const requirementApi = {
  list: (projectId: string, params?: { page?: number; pageSize?: number; limit?: number }) =>
    api.get(`/projects/${projectId}/requirements`, params ? { params } : undefined),
  listAll: (params?: { page?: number; pageSize?: number; limit?: number }) =>
    api.get('/requirements', params ? { params } : undefined),
  get: (id: string) => api.get(`/requirements/${id}`),
  create: (projectId: string, data: { title: string; description?: string; priority?: string; assigneeId?: string }) =>
    api.post(`/projects/${projectId}/requirements`, data),
  update: (id: string, data: { title?: string; description?: string; status?: string; priority?: string; assigneeId?: string }) =>
    api.put(`/requirements/${id}`, data),
  delete: (id: string) => api.delete(`/requirements/${id}`),
}

// Task API
export const taskApi = {
  list: (params?: { projectId?: string; status?: string; assigneeId?: string; requirementId?: string; page?: number; pageSize?: number; limit?: number }) =>
    api.get('/tasks', { params }),
  create: (data: { title: string; description?: string; assigneeId?: string; assigneeIds?: string[]; participantIds?: string[]; parentTaskId?: string | null; requirementIds?: string[]; estimatedHours?: number; projectId?: string }) =>
    api.post('/tasks', data),
  get: (id: string) => api.get(`/tasks/${id}`),
  update: (id: string, data: { title?: string; description?: string; status?: string; assigneeId?: string | null; assigneeIds?: string[]; participantIds?: string[]; parentTaskId?: string | null; estimatedHours?: number }) =>
    api.put(`/tasks/${id}`, data),
  updateStatus: (id: string, status: string) =>
    api.put(`/tasks/${id}`, { status }),
  delete: (id: string) => api.delete(`/tasks/${id}`),
  // Smart task assignment
  getRecommendation: (taskId: string) =>
    api.get(`/tasks/${taskId}/recommend-agent`),
  getAgentsOverview: () =>
    api.get('/tasks/agents/overview'),
  autoAssign: (taskId: string) =>
    api.post(`/tasks/${taskId}/auto-assign`)
}

// Bug API
export const bugApi = {
  list: (params?: { taskId?: string; status?: string; reporterId?: string; assigneeId?: string; requirementId?: string; projectId?: string; page?: number; pageSize?: number; limit?: number }) =>
    api.get('/bugs', { params }),
  get: (id: string) => api.get(`/bugs/${id}`),
  create: (data: { title: string; description?: string; taskId?: string; severity?: string; assigneeId?: string; requirementId?: string; projectId?: string }) =>
    api.post('/bugs', data),
  update: (id: string, data: { title?: string; status?: string; description?: string; severity?: string; assigneeId?: string | null }) =>
    api.put(`/bugs/${id}`, data),
  updateStatus: (id: string, status: string) =>
    api.put(`/bugs/${id}`, { status }),
  delete: (id: string) => api.delete(`/bugs/${id}`),
}

// WorkLog API
export const workLogApi = {
  list: (params?: {
    userId?: string
    taskId?: string
    bugId?: string
    projectId?: string
    startDate?: string
    endDate?: string
    groupBy?: string
    /** 1-based page number (default 1). Ignored when `limit` is set. */
    page?: number
    /** Rows per page (default 50, max 200). Ignored when `limit` is set. */
    pageSize?: number
    /** Set to a positive int to cap returned rows (Excel export uses -1 for "all"). */
    limit?: number
  }) => api.get('/worklogs', { params }),
  create: (data: { taskId?: string; bugId?: string; hours: number; workDate: string; note?: string }) =>
    api.post('/worklogs', data),
  update: (id: string, data: { hours?: number; workDate?: string; note?: string }) =>
    api.put(`/worklogs/${id}`, data),
  delete: (id: string) => api.delete(`/worklogs/${id}`),
}

// Report API
export const reportApi = {
  cost: (projectId: string) => api.get('/reports/cost', { params: { projectId } }),
  progress: (projectId: string) => api.get('/reports/progress', { params: { projectId } }),
}

// Attachment API
export const attachmentApi = {
  upload: (file: File, entityType: 'requirement' | 'task' | 'project' | 'wiki' | 'bug', entityId: string) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('entityType', entityType)
    formData.append('entityId', entityId)
    return api.post('/attachments/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  list: (entityType: string, entityId: string) =>
    api.get(`/attachments/entity/${entityType}/${entityId}`),
  listByProject: (projectId: string) =>
    api.get(`/attachments/project/${projectId}`),
  delete: (id: string) => api.delete(`/attachments/${id}`),
}

// Wiki API
export const wikiApi = {
  list: (projectId: string) => api.get('/wikis', { params: { projectId } }),
  get: (id: string) => api.get(`/wikis/${id}`),
  create: (data: { projectId: string; title: string; content?: string }) =>
    api.post('/wikis', data),
  update: (id: string, data: { title?: string; content?: string; order?: number }) =>
    api.put(`/wikis/${id}`, data),
  delete: (id: string) => api.delete(`/wikis/${id}`),
}

// Document import API (Word/Excel/PDF → MD via LLM)
export const documentApi = {
  parse: (formData: FormData) =>
    api.post('/documents/parse', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  batchParse: (formData: FormData) =>
    api.post('/documents/batch-parse', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
}

// Agent API
export const agentApi = {
  list: () => api.get('/agents'),
  get: (id: string) => api.get(`/agents/${id}`),
  create: (data: { email: string; name: string; password: string; role?: string; agentConfig?: any }) =>
    api.post('/agents', data),
  update: (id: string, data: { name?: string; role?: string; agentConfig?: any }) =>
    api.put(`/agents/${id}`, data),
  delete: (id: string) => api.delete(`/agents/${id}`),
  getStats: (id: string) => api.get(`/agents/${id}/stats`),
  getTasks: (id: string, status?: string) => api.get(`/agents/${id}/tasks`, { params: { status } }),
  getAvailableTasks: (projectId?: string, limit?: number) =>
    api.get('/agents/available-tasks', { params: { projectId, limit } }),
  claimTask: (taskId: string) => api.post('/agents/claim-task', { taskId }),
  releaseTask: (taskId: string) => api.post('/agents/release-task', { taskId }),
}

// Token Log API
export const tokenLogApi = {
  list: (params?: { userId?: string; taskId?: string; startDate?: string; endDate?: string; agentsOnly?: boolean; limit?: number }) =>
    api.get('/token-logs', { params }),
  create: (data: { taskId?: string; tokensUsed: number; inputTokens?: number; outputTokens?: number; model: string; costUSD?: number; description?: string; date?: string }) =>
    api.post('/token-logs', data),
  getStatsByModel: (params?: { userId?: string; startDate?: string; endDate?: string }) =>
    api.get('/token-logs/stats/by-model', { params }),
  getStatsByAgent: (params?: { startDate?: string; endDate?: string }) =>
    api.get('/token-logs/stats/by-agent', { params }),
}

// LLM Config API
export const llmConfigApi = {
  get: () => api.get('/llm-config'),
  update: (data: { apiUrl: string; apiKey?: string; model: string }) =>
    api.put('/llm-config', data),
}

// Agent Management API (admin dashboard / PM monitoring)
export const agentManagementApi = {
  getConnected: () => api.get('/agent-management/connected'),
  sendMessage: (agentId: string, message: any) =>
    api.post('/agent-management/send-message', { agentId, message }),
  assignTask: (agentId: string, taskId: string) =>
    api.post('/agent-management/assign-task', { agentId, taskId }),
  getLogs: (agentId: string) =>
    api.get(`/agent-management/${agentId}/logs`),
  intervene: (agentId: string, taskId: string, instruction: string) =>
    api.post('/agent-management/intervene', { agentId, taskId, instruction }),
  pause: (agentId: string, taskId: string) =>
    api.post('/agent-management/pause', { agentId, taskId }),
  resume: (agentId: string, taskId: string) =>
    api.post('/agent-management/resume', { agentId, taskId }),
  disconnect: (agentId: string) =>
    api.post('/agent-management/disconnect', { agentId }),
}
