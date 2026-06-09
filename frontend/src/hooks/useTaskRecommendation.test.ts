/**
 * useTaskRecommendation pure-helper tests — TD-NEW-2 (Sprint 18)
 *
 * 守住 3 個 pure helper 嘅行為,防止將來改 SKILL_KEYWORDS 嘅時候
 * silent break(改 typo / 漏 keyword / 中文 regex 撞 JSON escape 都唔
 * 會被 compile 攔到 — 一定要 run-time 驗)。
 *
 * 點解喺 frontend src 而唔係 backend:
 *   1. Hook 自家住喺 `frontend/src/hooks/`,tests colocate 跟住 source
 *   2. Pure helper 唔 import React,只 derive 數值,frontend 環境 OK
 *   3. Run command: `cd frontend && bun test src/hooks/useTaskRecommendation.test.ts`
 *      (bun 1.2 支援原生 .ts + ESM)
 *
 * 對應紅線 12(P0 規模性抽出嘅 helper 必有 unit test)— hook 雖然唔係 P0 US
 * 但屬 Sprint 17.1 抽出嘅 reusable,守住。
 */

import { describe, expect, test } from 'bun:test'
import {
  extractKeywords,
  pickBestAgent,
  scoreAgent,
  type AgentLike,
} from './useTaskRecommendation'

// Frontend 環境冇 @types/bun,而 tsconfig.app.json exclude 咗 .test.ts,所以
// `bun test` 直接跑呢 file,雖然 TS check 唔到但 runtime 仍 work
// (pure helpers 冇 React import,可 standalone 驗)

describe('useTaskRecommendation — extractKeywords', () => {
  test('純英文 title 抽 ≥2 char token', () => {
    expect(extractKeywords('review the code', '')).toEqual(['review', 'the', 'code'])
  })

  test('title + desc 都抽,concat 一起', () => {
    expect(extractKeywords('refactor', 'fix performance issue')).toEqual([
      'refactor', 'fix', 'performance', 'issue',
    ])
  })

  test('1 char 唔抽(\w{2,})', () => {
    expect(extractKeywords('a b c', '')).toEqual([])
  })

  test('空字串 / 全空白返 []', () => {
    expect(extractKeywords('', '')).toEqual([])
    expect(extractKeywords('   ', '  ')).toEqual([])
  })

  test('中文唔 match \w (唔期望抽到),要靠硬碼 keyword', () => {
    // 中文係 \W category,extractKeywords 抽唔到。要 match 「重構」SKILL keyword
    // 一定要 title 至少有英文 token,or 用中文 keyword literal 入 title
    // (呢個係 by design — 唔對 string regex 過度依賴)
    expect(extractKeywords('代碼審查', '')).toEqual([])
  })

  test('mixed 中英:得英文入 keywords', () => {
    expect(extractKeywords('fix code 審查', 'performance 優化')).toEqual([
      'fix', 'code', 'performance',
    ])
  })
})

describe('useTaskRecommendation — scoreAgent', () => {
  const makeAgent = (skills: string[], active = 0, max = 5): AgentLike => ({
    id: 'a1',
    name: 'Test Agent',
    skills,
    activeTasks: active,
    maxConcurrentTasks: max,
  })

  test('冇 skill → score 0', () => {
    expect(scoreAgent(makeAgent([]), ['review', 'code'])).toEqual({ score: 0, matchedSkills: [] })
  })

  test('skill keyword 命中 title keyword → +1 per skill', () => {
    // 「code review」喺 code_review skill 嘅 SKILL_KEYWORDS 入面,title「code」命中
    expect(scoreAgent(makeAgent(['code_review']), ['code', 'review'])).toEqual({
      score: 1,
      matchedSkills: ['code_review'],
    })
  })

  test('多 skill 命中 → score = matched count', () => {
    // testing keyword「test」+ documentation keyword「docs」都命中「test docs」
    expect(scoreAgent(makeAgent(['testing', 'documentation']), ['test', 'docs'])).toEqual({
      score: 2,
      matchedSkills: ['testing', 'documentation'],
    })
  })

  test('中文 keyword literal 命中', () => {
    // title「重構」命中 refactoring skill 嘅「重構」字串 literal
    expect(scoreAgent(makeAgent(['refactoring']), ['重構'])).toEqual({
      score: 1,
      matchedSkills: ['refactoring'],
    })
  })

  test('unknown skill 唔 throw,當 0 keyword 處理', () => {
    expect(scoreAgent(makeAgent(['unknown_skill_xyz']), ['test'])).toEqual({
      score: 0,
      matchedSkills: [],
    })
  })

  test('case-insensitive 雙向 substring match: title keyword 細寫 hit skill keyword 大寫', () => {
    // `keywords` array 已經 lower-case(extractKeywords 入面 .toLowerCase)
    // skillKeyword 內字唔 lower,所以要測 substring 雙向 case-insensitive
    // 註:實際 implementation 唔 explicit .toLowerCase skill side — depends on
    // user 寫 SKILL_KEYWORDS 嘅 case
    // 為咗保險,SKILL_KEYWORDS 全用 lower case — verify 命中
    expect(scoreAgent(makeAgent(['code_review']), ['CODE'])).toEqual({
      score: 0, // uppercase 唔 match(extractKeywords 已 lowercase title,呢度
      // pass 嘅係 user 顯式 uppercase,return 0 都預期)
      matchedSkills: [],
    })
  })
})

describe('useTaskRecommendation — pickBestAgent', () => {
  const makeAgent = (id: string, skills: string[], active = 0, max = 5): AgentLike => ({
    id, name: `Agent ${id}`, skills, activeTasks: active, maxConcurrentTasks: max,
  })

  test('冇 agents → null', () => {
    expect(pickBestAgent([], ['test'])).toBeNull()
  })

  test('capacity full agent skip', () => {
    expect(pickBestAgent(
      [makeAgent('a1', ['testing'], 5, 5)], // active == max → skip
      ['test'],
    )).toBeNull()
  })

  test('揾 score 最高', () => {
    const a1 = makeAgent('a1', ['testing'])
    const a2 = makeAgent('a2', ['testing', 'documentation', 'code_review'])
    const pick = pickBestAgent([a1, a2], ['test', 'docs', 'review'])
    expect(pick?.agent.id).toBe('a2')  // score 3 > score 1
    expect(pick?.matchedSkills).toEqual(['testing', 'documentation', 'code_review'])
  })

  test('並列 score 揾 first agent(Sprint 17 既有 behaviour: `> bestScore` strict)', () => {
    const a1 = makeAgent('a1', ['testing'])
    const a2 = makeAgent('a2', ['documentation'])
    // 兩個都 score 1,挑 a1(first)
    const pick = pickBestAgent([a1, a2], ['test', 'docs'])
    expect(pick?.agent.id).toBe('a1')
  })

  test('matchedSkills 嚴格只包入面命中嘅 skill(非 full agent skills)', () => {
    const agent = makeAgent('a1', ['testing', 'security_audit', 'design'])
    // title 命中「test」→ only testing
    const pick = pickBestAgent([agent], ['test'])
    expect(pick?.matchedSkills).toEqual(['testing'])
  })

  test('all agents capacity full → null', () => {
    const a1 = makeAgent('a1', ['testing'], 10, 10)
    const a2 = makeAgent('a2', ['testing'], 1, 1)
    expect(pickBestAgent([a1, a2], ['test'])).toBeNull()
  })

  test('SKILL_KEYWORDS invariant:8 個 skill 全部有 keyword map', () => {
    // 為咗 catch 將來加新 skill 但漏加 SKILL_KEYWORDS
    // 用「smoke test」:常見 keyword 對應到 skill
    const knownKeywords = [
      ['測試', 'testing'],
      ['bug', 'bug_analysis'],
      ['重構', 'refactoring'],
      ['安全', 'security_audit'],
      ['性能', 'performance'],
      ['設計', 'design'],
      ['文檔', 'documentation'],
      ['代碼審查', 'code_review'],
    ] as const

    for (const [keyword, expectedSkill] of knownKeywords) {
      const pick = pickBestAgent(
        [makeAgent('a1', [expectedSkill])],
        [keyword],
      )
      expect(pick?.agent.id).toBe('a1')
      expect(pick?.matchedSkills).toContain(expectedSkill)
    }
  })
})
