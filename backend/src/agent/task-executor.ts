/**
 * Server-side Task Executor
 * Automatically processes tasks assigned to agents using LLM
 */

import { prisma } from '../utils/prisma'

async function getLLMConfig(): Promise<{ apiUrl: string; apiKey: string; model: string } | null> {
  const config = await prisma.lLMConfig.findFirst()
  return config ? { apiUrl: config.apiUrl, apiKey: config.apiKey, model: config.model } : null
}

interface TaskContext {
  id: string
  title: string
  description?: string
  projectName?: string
  requirements?: string[]
}

export async function executeTask(taskId: string): Promise<{ success: boolean; result?: string; error?: string }> {
  // Get task details
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: { select: { id: true, name: true } },
      requirements: {
        include: { requirement: { select: { id: true, title: true } } }
      }
    }
  })

  if (!task) {
    return { success: false, error: 'Task not found' }
  }

  // Get LLM config
  const llmConfig = await getLLMConfig()
  if (!llmConfig) {
    return { success: false, error: 'LLM not configured. Please set up AI in Settings.' }
  }

  const context: TaskContext = {
    id: task.id,
    title: task.title,
    description: task.description || undefined,
    projectName: task.project?.name,
    requirements: task.requirements.map(r => r.requirement.title)
  }

  // Build prompt
  const prompt = buildPrompt(context)

  try {
    // Call LLM API
    const response = await fetch(llmConfig.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${llmConfig.apiKey}`
      },
      body: JSON.stringify({
        model: llmConfig.model,
        messages: [
          { role: 'system', content: '你是一個專業的軟件開發助手。請根據任務描述完成工作，並以 Markdown 格式輸出結果。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `LLM API error: ${response.status} - ${errorText}` }
    }

    const data = await response.json()
    const result = data.choices?.[0]?.message?.content || '任務已完成'

    // Update task status
    await prisma.task.update({
      where: { id: taskId },
      data: { status: 'completed' }
    })

    // Create wiki page with result
    await prisma.wikiPage.create({
      data: {
        projectId: task.projectId,
        title: `[任務完成] ${task.title}`,
        content: result,
        tags: ['agent', 'auto-task', task.id],
        createdById: task.assigneeId || 'system'
      }
    })

    // Log token usage (estimate)
    const inputTokens = Math.ceil(prompt.length / 4)
    const outputTokens = Math.ceil(result.length / 4)
    const totalTokens = inputTokens + outputTokens

    if (task.assigneeId) {
      await prisma.tokenLog.create({
        data: {
          userId: task.assigneeId,
          taskId: task.id,
          tokensUsed: totalTokens,
          inputTokens,
          outputTokens,
          model: llmConfig.model,
          date: new Date(),
          description: `Auto task: ${task.title}`
        }
      })
    }

    return { success: true, result }

  } catch (error: any) {
    console.error('Task execution error:', error)
    return { success: false, error: error.message || 'Execution failed' }
  }
}

function buildPrompt(context: TaskContext): string {
  let prompt = `# 任務：${context.title}\n\n`

  if (context.description) {
    prompt += `## 任務描述\n${context.description}\n\n`
  }

  if (context.projectName) {
    prompt += `## 項目\n${context.projectName}\n\n`
  }

  if (context.requirements && context.requirements.length > 0) {
    prompt += `## 相關需求\n${context.requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}\n\n`
  }

  prompt += `請完成此任務並以 Markdown 格式輸出結果。如果需要代碼，請提供完整的代碼示例。`

  return prompt
}
