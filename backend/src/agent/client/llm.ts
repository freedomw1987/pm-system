/**
 * LLM 调用封装
 * 支持 OpenAI 兼容 API
 */

export interface LLMConfig {
  apiUrl: string
  apiKey: string
  model: string
  systemPrompt?: string
  temperature?: number
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatResult {
  content: string
  usage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
}

const DEFAULT_SYSTEM_PROMPT = `你是一個專業的 AI Agent，擅長分析和解決軟件工程問題。
你的職責是：
1. 理解任務需求
2. 分析問題並提供解決方案
3. 產出高質量的代碼或文檔

請用中文回答。`

/**
 * 調用 LLM API
 */
export async function chat(
  messages: ChatMessage[],
  config: LLMConfig
): Promise<ChatResult> {
  // 確保 apiUrl 不帶尾部斜槓
  const baseUrl = config.apiUrl.replace(/\/$/, '')

  const requestBody: any = {
    model: config.model,
    messages: [
      { role: 'system', content: config.systemPrompt || DEFAULT_SYSTEM_PROMPT },
      ...messages
    ],
    stream: false,
    temperature: config.temperature ?? 0.7
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`LLM API 错误: ${response.status} - ${error}`)
  }

  const data = await response.json()

  return {
    content: data.choices[0]?.message?.content || '',
    usage: {
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0
    }
  }
}

/**
 * 获取可用的模型列表（如果 API 支持）
 */
export async function listModels(config: LLMConfig): Promise<string[]> {
  const baseUrl = config.apiUrl.replace(/\/$/, '')

  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`
      }
    })

    if (response.ok) {
      const data = await response.json()
      return data.data?.map((m: any) => m.id) || []
    }
  } catch (error) {
    console.warn('获取模型列表失败:', error)
  }

  return [config.model]
}