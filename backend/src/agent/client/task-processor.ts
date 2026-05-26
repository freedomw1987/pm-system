/**
 * 任务处理逻辑
 * 接收任务 → 调用 LLM → 生成结果 → 返回 Wiki 内容
 */

import { chat, LLMConfig, ChatMessage } from './llm'

export interface TaskPayload {
  taskId: string
  title: string
  description?: string
  projectId: string
  projectName?: string
  requirements?: { id: string; title: string }[]
}

export interface TaskResult {
  success: boolean
  tokensUsed: number
  inputTokens: number
  outputTokens: number
  model: string
  wikiContent: string
  result?: string
  error?: string
}

/**
 * 处理单个任务
 */
export async function processTask(
  task: TaskPayload,
  llmConfig: LLMConfig
): Promise<TaskResult> {
  const startTime = Date.now()

  try {
    // 构建提示词
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: buildTaskPrompt(task)
      }
    ]

    // 调用 LLM
    const result = await chat(messages, llmConfig)

    // 生成 Wiki 内容
    const wikiContent = generateWikiContent(task, result.content, result.usage, startTime)

    return {
      success: true,
      tokensUsed: result.usage.totalTokens,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      model: llmConfig.model,
      wikiContent,
      result: result.content
    }
  } catch (error: any) {
    console.error(`处理任务 ${task.taskId} 失败:`, error)

    return {
      success: false,
      tokensUsed: 0,
      inputTokens: 0,
      outputTokens: 0,
      model: llmConfig.model,
      wikiContent: generateErrorWikiContent(task, error.message),
      error: error.message
    }
  }
}

/**
 * 构建任务提示词
 */
function buildTaskPrompt(task: TaskPayload): string {
  let prompt = `# 任务：${task.title}\n\n`

  if (task.description) {
    prompt += `## 任务描述\n${task.description}\n\n`
  }

  if (task.projectName) {
    prompt += `## 项目\n${task.projectName}\n\n`
  }

  if (task.requirements && task.requirements.length > 0) {
    prompt += `## 关联需求\n`
    for (const req of task.requirements) {
      prompt += `- ${req.title}\n`
    }
    prompt += '\n'
  }

  prompt += `请根据以上信息，完成任务并提供解决方案。`

  return prompt
}

/**
 * 生成 Wiki 内容（成功时）
 */
function generateWikiContent(
  task: TaskPayload,
  result: string,
  usage: { inputTokens: number; outputTokens: number; totalTokens: number },
  startTime: number
): string {
  const duration = Math.round((Date.now() - startTime) / 1000)
  const completedAt = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })

  return `# ${task.title} - 执行记录

## 基本信息

| 项目 | 值 |
|------|-----|
| 任务 ID | ${task.taskId} |
| 项目 | ${task.projectName || '未指定'} |
| 完成时间 | ${completedAt} |
| 处理耗时 | ${duration} 秒 |
| 使用模型 | ${task.projectName} |
| Token 使用 | 输入 ${usage.inputTokens} / 输出 ${usage.outputTokens} / 总计 ${usage.totalTokens} |

## 任务描述

${task.description || '无'}

${task.requirements && task.requirements.length > 0 ? `## 关联需求

${task.requirements.map(r => `- ${r.title}`).join('\n')}` : ''}

## 执行结果

${result}

---
*由 AI Agent 自动生成于 ${completedAt}*
`
}

/**
 * 生成 Wiki 内容（失败时）
 */
function generateErrorWikiContent(task: TaskPayload, error: string): string {
  return `# ${task.title} - 执行失败

## 基本信息

| 项目 | 值 |
|------|-----|
| 任务 ID | ${task.taskId} |
| 项目 | ${task.projectName || '未指定'} |
| 失败时间 | ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })} |

## 任务描述

${task.description || '无'}

## 错误信息

\`\`\`
${error}
\`\`\`

---
*由 AI Agent 自动生成*
`
}