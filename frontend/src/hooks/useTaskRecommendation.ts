/**
 * useTaskRecommendation — Sprint 17.1 抽出嘅 reusable hook
 *
 * 點解抽:Sprint 17 unify AddTaskModal 嗰陣,我將 ProjectDetailPage 嘅 60 行
 *        recommended-agent useEffect 整段 copy 去 ProjectKanban。兩邊 100%
 *        identical(除咗 comment),係 textbook 級嘅 copy-paste 債。Refactor
 *        抽 hook 後,將來改 keyword mapping / debounce delay / score 邏輯只改
 *        一處,避免再次 drift。
 *
 * 用法:
 *   const { recommendedAgent } = useTaskRecommendation({
 *     title: newTaskTitle,
 *     description: newTaskDesc,
 *     autoAssignAgent,
 *     onAutoAssign: (agentId) => setNewTaskAssignee(agentId),
 *   })
 *
 * Invariant 守住(對應 Sprint 17 原 implementation):
 * - Trigger 條件:`title.trim() && title.length >= 3`(短 title 唔做推薦)
 * - Debounce:500ms(避免 typing 中段 spam API)
 * - 結束:title 變空 / < 3 char → `setRecommendedAgent(null)`,UI 即時 reset
 * - Cleanup:每次 effect re-run / unmount 都 clearTimeout(避免 stale callback)
 * - `autoAssignAgent` 嘅 caller side-effect:推薦命中 → 自動 set assignee
 *   ⚠️ 但只係 onAutoAssign callback(caller 自己 wire,避免 hook 內部直接
 *      touch caller state setters,維持 caller 控制)
 */

import { useEffect, useState } from 'react'
import { taskApi } from '../utils/api'
import type { RecommendedAgent } from '../components/AddTaskModal'

/** Skill keyword mapping — Sprint 17 原 hardcoded list,抽出嚟單一 source of truth */
const SKILL_KEYWORDS: Record<string, string[]> = {
  code_review: ['代碼審查', 'code review', 'review', 'pull request', 'pr', '審視', '審核'],
  testing: ['測試', 'test', 'unit test', '測試用例', '自動化'],
  documentation: ['文檔', 'docs', 'readme', 'wiki', '手冊'],
  bug_analysis: ['bug', 'bug分析', '錯誤', '除錯', 'debug', '問題', '修復'],
  refactoring: ['重構', 'refactor', '優化'],
  security_audit: ['安全', 'security', '漏洞', '審計'],
  performance: ['性能', '效能', '優化', 'slow'],
  design: ['設計', '架構', 'architecture', '系統設計'],
}

interface AgentLike {
  id: string
  name: string
  skills?: string[]
  activeTasks: number
  maxConcurrentTasks: number
}

export interface UseTaskRecommendationOptions {
  /** 任務標題 — main signal for recommendation */
  title: string
  /** 任務描述 — secondary signal,concat 入 keyword pool */
  description: string
  /** 用戶有冇 opt-in auto-assign */
  autoAssignAgent: boolean
  /**
   * Hook 揾到 recommendation + autoAssignAgent=true 時 fire 一次,
   * caller 自己 setState 將 task assignee 改去 agent.id
   */
  onAutoAssign?: (agentId: string) => void
  /** Debounce delay,default 500ms(可 override 寫 unit test) */
  debounceMs?: number
}

export interface UseTaskRecommendationResult {
  /** Current recommendation,if any。null = 唔推薦(title 太短 / 冇 agent 對得上) */
  recommendedAgent: RecommendedAgent | null
}

/**
 * Pure scoring function — 抽出嚟方便 test(冇 React 依賴)。
 * Sprint 17 原 logic:每個 agent 計 score = 入面 skill 嘅 keyword 喺
 * (title + desc) keywords 入面命中嘅 count;score > 0 至算數,take max。
 */
export function scoreAgent(
  agent: AgentLike,
  keywords: string[],
): { score: number; matchedSkills: string[] } {
  const matchedSkills = (agent.skills || []).filter((skill: string) => {
    const kws = SKILL_KEYWORDS[skill] || []
    return keywords.some((kw: string) => kws.some((k: string) => k.includes(kw) || kw.includes(k)))
  })
  return { score: matchedSkills.length, matchedSkills }
}

/** Pure helper — extract keywords 由 title + desc */
export function extractKeywords(title: string, description: string): string[] {
  return (title + ' ' + description).toLowerCase().match(/\w{2,}/g) || []
}

/**
 * Pure picker — 由 agents 集合揾 best match。capacity full 嘅 agent skip。
 * 回傳 best agent + score + matchedSkills,或 null(冇 agent 命中)。
 */
export function pickBestAgent(
  agents: AgentLike[],
  keywords: string[],
): { agent: AgentLike; matchedSkills: string[] } | null {
  let best: AgentLike | null = null
  let bestScore = 0
  let bestMatched: string[] = []

  for (const agent of agents) {
    if (agent.activeTasks >= agent.maxConcurrentTasks) continue
    const { score, matchedSkills } = scoreAgent(agent, keywords)
    if (score > bestScore) {
      best = agent
      bestScore = score
      bestMatched = matchedSkills
    }
  }

  return best ? { agent: best, matchedSkills: bestMatched } : null
}

/**
 * React hook — debounce + fetch + score + autoAssign,full lifecycle managed。
 */
export function useTaskRecommendation({
  title,
  description,
  autoAssignAgent,
  onAutoAssign,
  debounceMs = 500,
}: UseTaskRecommendationOptions): UseTaskRecommendationResult {
  const [recommendedAgent, setRecommendedAgent] = useState<RecommendedAgent | null>(null)

  useEffect(() => {
    if (!title.trim() || title.length < 3) {
      setRecommendedAgent(null)
      return
    }

    const timer = setTimeout(async () => {
      try {
        const agentsResponse = await taskApi.getAgentsOverview()
        const agents: AgentLike[] = agentsResponse.data.agents || []
        const keywords = extractKeywords(title, description)
        const pick = pickBestAgent(agents, keywords)

        if (pick) {
          setRecommendedAgent({
            id: pick.agent.id,
            name: pick.agent.name,
            skills: pick.matchedSkills,
          })
          if (autoAssignAgent && onAutoAssign) {
            onAutoAssign(pick.agent.id)
          }
        } else {
          setRecommendedAgent(null)
        }
      } catch (err) {
        // Sprint 17 原 behaviour:console.error 唔 throw,UI 仲 work(recommend 算
        // optional 功能,後端 down 時 modal 仲應該畀用戶手動 assign)
        console.error('Failed to get recommendation:', err)
      }
    }, debounceMs)

    return () => clearTimeout(timer)
  }, [title, description, autoAssignAgent, onAutoAssign, debounceMs])

  return { recommendedAgent }
}
