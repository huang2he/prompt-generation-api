import 'dotenv/config'

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '')

export const config = {
  port: Number(process.env.PORT || 8791),
  apiKey: process.env.API_KEY || 'local-key',
  apiSecret: process.env.API_SECRET || 'local-secret',
  webPassword: process.env.WEB_PASSWORD || '',
  webSessionCookie: process.env.WEB_SESSION_COOKIE || 'pg_web_session',
  webCookieSecure: process.env.WEB_COOKIE_SECURE === 'true',
  mockQwen: process.env.MOCK_QWEN !== 'false',
  llmTransport: process.env.LLM_TRANSPORT || 'direct',
  qwenApiKey: process.env.QWEN_API_KEY || '',
  qwenBaseUrl: trimTrailingSlash(
    process.env.QWEN_BASE_URL ||
      'https://dashscope.aliyuncs.com/compatible-mode/v1'
  ),
  qwenModel: process.env.QWEN_MODEL || 'qwen3.7-max',
  qwenEnableThinking: process.env.QWEN_ENABLE_THINKING === 'true',
  llmMaxTokens: Number(process.env.LLM_MAX_TOKENS || 2400),
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiBaseUrl:
    process.env.GEMINI_BASE_URL ||
    'https://generativelanguage.googleapis.com/v1beta/openai',
  dispatcherBaseUrl: trimTrailingSlash(
    process.env.DISPATCHER_BASE_URL || 'http://47.100.137.178:8080'
  ),
  dispatcherUsername: process.env.DISPATCHER_USERNAME || '',
  dispatcherPassword: process.env.DISPATCHER_PASSWORD || '',
  dispatcherProxy: process.env.DISPATCHER_PROXY === 'true',
  maxConcurrentJobs: Number(process.env.MAX_CONCURRENT_JOBS || 2),
  metaPromptVersion: process.env.META_PROMPT_VERSION || 'outbound-v0.1.0',
  metaPromptPath: process.env.META_PROMPT_PATH || 'prompts/outbound-v0.md',
  langfuseEnabled: process.env.LANGFUSE_ENABLED === 'true',
  langfusePublicKey: process.env.LANGFUSE_PUBLIC_KEY || '',
  langfuseSecretKey: process.env.LANGFUSE_SECRET_KEY || '',
  langfuseBaseUrl: trimTrailingSlash(
    process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com'
  ),
  langfuseEnvironment: process.env.LANGFUSE_ENVIRONMENT || 'local',
  langfuseRedactIo: process.env.LANGFUSE_REDACT_IO === 'true'
}
