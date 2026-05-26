/**
 * 智能技能匹配器
 * 根據任務內容自動匹配擅長的 Agent
 */

import { prisma } from '../utils/prisma'

// 技能關鍵詞映射
const SKILL_KEYWORDS: Record<string, string[]> = {
  code_review: [
    '代碼審查', 'code review', 'review', 'pull request', 'pr', '審視',
    '程式碼審核', '程式審查', '代碼審核', '程式碼審視', 'code review',
    'CR', 'code review', 'codereview'
  ],
  testing: [
    '測試', 'test', 'unit test', '測試用例', 'e2e', 'integration',
    '測試報告', '測試案例', '自動化測試', '單元測試', '功能測試',
    'testing', 'test case', 'test report', 'UT', 'AT'
  ],
  documentation: [
    '文檔', 'docs', 'readme', 'wiki', '手冊', '說明',
    '文檔撰寫', '技術文檔', 'api 文檔', '接口文檔', '使用說明',
    'documentation', 'api docs', 'manual'
  ],
  bug_analysis: [
    'bug', '錯誤', '除錯', 'debug', '問題', 'issue',
    'bug 分析', '修復', '缺陷', '錯誤排查', '故障',
    'bug fix', 'debug', 'defect', 'error'
  ],
  refactoring: [
    '重構', 'refactor', '優化', '代碼質量',
    '代碼重構', '代碼優化', '重寫', '整理',
    'refactoring', 'code quality', 'clean code'
  ],
  security_audit: [
    '安全', 'security', '漏洞', '滲透',
    '安全審計', '安全評估', '滲透測試', 'xss', 'sql injection',
    'security audit', 'pentest', 'vulnerability'
  ],
  performance: [
    '性能', '效能', 'slow', '響應',
    '性能優化', '效能優化', '響應慢', '卡頓',
    'performance', 'optimization', 'slow query', 'cache'
  ],
  design: [
    '設計', '架構', 'architecture', '系統設計', '方案',
    '架構設計', '系統架構', '方案設計', '藍圖',
    'design', 'architecture', 'system design'
  ]
}

export interface TaskKeywordMatch {
  taskId: string
  taskTitle: string
  keywords: string[]
  matchedSkills: string[]
}

export interface AgentRecommendation {
  agent: {
    id: string
    name: string
    email: string
    role: string
    skills: string[]
    maxConcurrentTasks: number
  }
  matchScore: number
  matchedSkills: string[]
  reasons: string[]
}

/**
 * 從文本中提取關鍵詞
 */
export function extractKeywords(text: string): string[] {
  if (!text) return []

  // 轉換為小寫並處理標點
  const normalized = text
    .toLowerCase()
    .replace(/[，。！？、：；「」（）『』【】《》<>""'']/g, ' ')
    .replace(/[.,!?;:'"()\[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // 分詞
  const words = normalized.split(' ').filter(w => w.length >= 2)

  // 去重
  return [...new Set(words)]
}

/**
 * 計算任務關鍵詞與 Agent 技能的匹配分數
 */
export function calculateMatchScore(taskKeywords: string[], agentSkills: string[]): { score: number; matchedSkills: string[]; reasons: string[] } {
  let score = 0
  const matchedSkills: string[] = []
  const reasons: string[] = []

  for (const skill of agentSkills) {
    const keywords = SKILL_KEYWORDS[skill] || []
    const taskKeywordsLower = taskKeywords.map(k => k.toLowerCase())

    // 檢查是否有匹配的關鍵詞
    for (const kw of taskKeywordsLower) {
      const matchedKeyword = keywords.find(k =>
        k.toLowerCase().includes(kw) || kw.includes(k.toLowerCase())
      )
      if (matchedKeyword) {
        score += 1
        if (!matchedSkills.includes(skill)) {
          matchedSkills.push(skill)
          reasons.push(`技能「${skill}」匹配關鍵詞「${matchedKeyword}」`)
        }
        break // 每個技能只計算一次
      }
    }
  }

  return { score, matchedSkills, reasons }
}

/**
 * 分析任務並找到最佳匹配的 Agent
 */
export async function findBestAgent(taskId: string): Promise<AgentRecommendation | null> {
  // 獲取任務
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: { select: { id: true, name: true } },
      requirements: {
        include: { requirement: { select: { title: true } } }
      }
    }
  })

  if (!task) return null

  // 提取任務關鍵詞
  const taskText = [
    task.title,
    task.description || '',
    ...task.requirements.map(r => r.requirement.title)
  ].join(' ')

  const taskKeywords = extractKeywords(taskText)

  if (taskKeywords.length === 0) return null

  // 獲取所有 Agent
  const agents = await prisma.user.findMany({
    where: { isAgent: true },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      agentConfig: true,
      _count: {
        select: {
          assignedTasks: {
            where: {
              status: { in: ['pending', 'in_progress'] }
            }
          }
        }
      }
    }
  })

  if (agents.length === 0) return null

  // 計算每個 Agent 的匹配分數
  const matches = agents.map(agent => {
    const skills = (agent.agentConfig as any)?.skills || []
    const maxConcurrent = (agent.agentConfig as any)?.maxConcurrentTasks || 3
    const currentLoad = agent._count.assignedTasks

    const { score, matchedSkills, reasons } = calculateMatchScore(taskKeywords, skills)

    return {
      agent: {
        id: agent.id,
        name: agent.name,
        email: agent.email,
        role: agent.role,
        skills,
        maxConcurrentTasks: maxConcurrent
      },
      matchScore: score,
      matchedSkills,
      reasons,
      // 考慮負載：活躍任務少於最大並發的 Agent 優先
      loadFactor: currentLoad < maxConcurrent ? 1 : 0.5
    }
  })

  // 排序：先按分數，再按負載
  matches.sort((a, b) => {
    const aFinalScore = a.matchScore * a.loadFactor
    const bFinalScore = b.matchScore * b.loadFactor
    return bFinalScore - aFinalScore
  })

  // 只返回有匹配的結果
  const bestMatch = matches.find(m => m.matchScore > 0)
  if (!bestMatch) return null

  return {
    agent: bestMatch.agent,
    matchScore: bestMatch.matchScore,
    matchedSkills: bestMatch.matchedSkills,
    reasons: bestMatch.reasons
  }
}

/**
 * 為多個任務推薦 Agent（批量）
 */
export async function findBestAgentsForTasks(taskIds: string[]): Promise<Map<string, AgentRecommendation | null>> {
  const results = new Map<string, AgentRecommendation | null>()

  for (const taskId of taskIds) {
    const recommendation = await findBestAgent(taskId)
    results.set(taskId, recommendation)
  }

  return results
}

/**
 * 獲取所有可用 Agent 的技能概覽
 */
export async function getAgentsSkillOverview(): Promise<{
  agents: Array<{
    id: string
    name: string
    skills: string[]
    activeTasks: number
    maxConcurrentTasks: number
  }>
}> {
  const agents = await prisma.user.findMany({
    where: { isAgent: true },
    select: {
      id: true,
      name: true,
      agentConfig: true,
      _count: {
        select: {
          assignedTasks: {
            where: { status: { in: ['pending', 'in_progress'] } }
          }
        }
      }
    }
  })

  return {
    agents: agents.map(a => ({
      id: a.id,
      name: a.name,
      skills: (a.agentConfig as any)?.skills || [],
      activeTasks: a._count.assignedTasks,
      maxConcurrentTasks: (a.agentConfig as any)?.maxConcurrentTasks || 3
    }))
  }
}