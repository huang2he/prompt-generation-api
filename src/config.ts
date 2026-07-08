import 'dotenv/config'

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '')

const splitList = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

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
  geminiBaseUrl: trimTrailingSlash(
    process.env.GEMINI_BASE_URL ||
      'https://generativelanguage.googleapis.com/v1beta/openai'
  ),
  geminiReasoningEffort: process.env.GEMINI_REASONING_EFFORT || 'low',
  dispatcherBaseUrl: trimTrailingSlash(
    process.env.DISPATCHER_BASE_URL || 'http://47.100.137.178:8080'
  ),
  dispatcherUsername: process.env.DISPATCHER_USERNAME || '',
  dispatcherPassword: process.env.DISPATCHER_PASSWORD || '',
  dispatcherProxy: process.env.DISPATCHER_PROXY === 'true',
  maxConcurrentJobs: Number(process.env.MAX_CONCURRENT_JOBS || 2),

  // Pipeline: A = v0 single, B = v1 single, C = v1 two-stage, D = v1 three-stage (golden-line pool)
  defaultPipeline: (process.env.DEFAULT_PIPELINE || 'C').toUpperCase(),

  // Meta prompt files
  metaPromptVersion: process.env.META_PROMPT_VERSION || 'outbound-v1.0.0',
  legacyMetaPromptPath:
    process.env.LEGACY_META_PROMPT_PATH || 'prompts/outbound-v0.md',
  analyzeMetaPromptPath:
    process.env.ANALYZE_META_PROMPT_PATH || 'prompts/analyze-v1.md',
  generateMetaPromptPath:
    process.env.GENERATE_META_PROMPT_PATH || 'prompts/generate-v1.md',
  goldenMetaPromptPath:
    process.env.GOLDEN_META_PROMPT_PATH || 'prompts/golden-lines-v1.md',

  // Per-stage models
  analyzeModel: process.env.ANALYZE_MODEL || 'qwen3.7-max',
  generateModel: process.env.GENERATE_MODEL || 'qwen3.7-max',
  goldenLineModels: splitList(
    process.env.GOLDEN_LINE_MODELS || 'qwen3.7-max,gemini-3.5-flash'
  ),

  // Per-stage token guards
  analyzeMaxTokens: Number(process.env.ANALYZE_MAX_TOKENS || 1800),
  goldenMaxTokens: Number(process.env.GOLDEN_MAX_TOKENS || 2400),

  langfuseEnabled: process.env.LANGFUSE_ENABLED === 'true',
  langfusePublicKey: process.env.LANGFUSE_PUBLIC_KEY || '',
  langfuseSecretKey: process.env.LANGFUSE_SECRET_KEY || '',
  langfuseBaseUrl: trimTrailingSlash(
    process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com'
  ),
  langfuseEnvironment: process.env.LANGFUSE_ENVIRONMENT || 'local',
  langfuseRedactIo: process.env.LANGFUSE_REDACT_IO === 'true'
}
