/**
 * Agent Client 入口
 * 启动 AI Agent 客户端
 */

import { AgentClient, AgentClientConfig } from './client'

// 从环境变量读取配置
const config: AgentClientConfig = {
  agentId: process.env.AGENT_ID || '',
  agentToken: process.env.AGENT_TOKEN || '',
  backendUrl: process.env.BACKEND_URL || 'http://localhost:4001',
  wsUrl: process.env.WS_URL || 'ws://localhost:4000',
  maxConcurrent: parseInt(process.env.MAX_CONCURRENT || '1', 10)
}

// 验证配置
if (!config.agentId || !config.agentToken) {
  console.error('❌ 缺少必需的环境变量:')
  console.error('   AGENT_ID - Agent 用户 ID')
  console.error('   AGENT_TOKEN - Agent 认证令牌')
  console.error('')
  console.error('示例:')
  console.error('   AGENT_ID=<id> AGENT_TOKEN=<token> bun run backend/src/agent/client/index.ts')
  process.exit(1)
}

console.log(`
╔══════════════════════════════════════════╗
║       AI Agent Client 启动              ║
╠══════════════════════════════════════════╣
║  Agent ID:    ${config.agentId.slice(0, 16).padEnd(26)}║
║  Backend:     ${config.backendUrl.padEnd(26)}║
║  WebSocket:   ${config.wsUrl.padEnd(26)}║
╚══════════════════════════════════════════╝
`)

const client = new AgentClient(config)

// 启动连接
client.connect()

// 处理进程退出
const shutdown = () => {
  console.log('\n正在关闭 Agent Client...')
  client.disconnect()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)