// User types
export interface User {
  id: string
  email: string
  name: string
  role?: 'admin' | 'pm' | 'tech_lead' | 'developer' | 'tester' | 'Visitor'
  permissions?: string[]
  isAgent?: boolean
  agentConfig?: {
    model?: string
    maxConcurrentTasks?: number
    personality?: string
  }
  departmentId?: string | null
  department?: { id: string; name: string } | null
  createdAt?: string
  /** Per-project memberships — populated in user list for RBAC display */
  projectMemberships?: { projectId: string; projectName: string; role: string }[]
}

// Agent types
export interface Agent {
  id: string
  email: string
  name: string
  role: string
  isAgent: boolean
  agentConfig?: {
    token?: string
    maxConcurrentTasks?: number
    temperature?: number
    systemPrompt?: string
    skills?: string[]
    mcpServers?: string[]
  }
  createdAt: string
  stats?: {
    activeTasks: number
    totalTokenLogs: number
    totalTokensUsed: number
  }
  assignedTasks?: {
    id: string
    title: string
    status: string
    projectId: string
    project?: { id: string; name: string }
    createdAt: string
    updatedAt: string
  }[]
}

export interface TokenLog {
  id: string
  userId: string
  user?: User
  taskId?: string
  task?: { id: string; title: string; projectId?: string }
  tokensUsed: number
  inputTokens?: number
  outputTokens?: number
  model: string
  costUSD?: number
  date: string
  description?: string
  createdAt: string
}

export interface TokenSummary {
  totalTokens: number
  totalInputTokens: number
  totalOutputTokens: number
  count: number
}

export interface Role {
  id: string
  name: string
  description?: string | null
  permissions: string[]
  isBuiltIn: boolean
  createdAt?: string
  updatedAt?: string
}

export interface Department {
  id: string
  name: string
  userCount?: number
  createdAt?: string
  updatedAt?: string
}

export interface Permission {
  id: string
  key: string
  name: string
  category: string
}

export interface ProjectMember {
  id: string
  userId: string
  user: User
  role: 'pm' | 'tech_lead' | 'developer' | 'tester'
}

// Project types
export interface Project {
  id: string
  name: string
  description?: string
  status: 'active' | 'completed' | 'archived'
  createdAt: string
  owner?: User
  members?: ProjectMember[]
  requirements?: Requirement[]
  memberCount?: number
  requirementCount?: number
  _count?: {
    requirements?: number
    tasks?: number
  }
}

// Requirement types
export interface Requirement {
  id: string
  projectId: string
  title: string
  description?: string
  priority: 'low' | 'medium' | 'high'
  status: 'pending' | 'in_progress' | 'completed'
  createdBy?: User
  createdAt: string
  taskCount?: number
  tasks?: Task[]
  project?: { id: string; name: string }
}

// Task types
export interface Task {
  id: string
  title: string
  description?: string
  assignee?: User & { isAgent?: boolean }
  assigneeId?: string
  status: 'pending' | 'in_progress' | 'testing' | 'completed'
  estimatedHours?: number
  claimedByAgentAt?: string
  createdAt: string
  requirements?: { requirement: Requirement }[]
  workLogs?: WorkLog[]
  project?: { id: string; name: string }
}

// Bug types
export interface Bug {
  id: string
  taskId?: string
  requirementId?: string
  title: string
  description?: string
  reporter?: User
  status: 'open' | 'in_progress' | 'resolved' | 'verified' | 'closed'
  severity: 'low' | 'medium' | 'high' | 'critical'
  createdAt: string
  task?: { id: string; title: string; project?: { id: string; name: string } }
}

// WorkLog types
export interface WorkLog {
  id: string
  userId: string
  user?: User
  taskId?: string
  bugId?: string
  hours: number
  workDate: string
  note?: string
  task?: { id: string; title: string; project?: { id: string; name: string } }
  bug?: { id: string; title: string; project?: { id: string; name: string } }
}

// Attachment types
export interface Attachment {
  id: string
  entityType: 'requirement' | 'task'
  entityId: string
  filename: string
  storedPath: string
  mimeType: string
  fileSize: number
  uploadedBy?: User
  createdAt: string
}

// Auth types
export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  accessToken: string
  refreshToken: string
  user: User
}

// API Error types
export interface ApiError {
  error: {
    code: string
    message: string
  }
}

// Report types
export interface CostReport {
  project: { id: string; name: string }
  totalHours: number
  members: {
    userId: string
    name: string
    email: string
    totalHours: number
    tasks: { taskId: string; title: string; hours: number }[]
  }[]
}

export interface ProgressReport {
  project: { id: string; name: string }
  totalRequirements: number
  completedRequirements: number
  requirementsProgress: number
  totalTasks: number
  completedTasks: number
  tasksProgress: number
  totalBugs: number
  openBugs: number
  resolvedBugs: number
}