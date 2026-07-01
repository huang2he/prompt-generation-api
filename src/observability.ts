import { Langfuse } from 'langfuse'
import { config } from './config.js'
import type { PromptGenerationRequest } from './schemas.js'

type ModelUsage = {
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
} | null

type TraceInput = {
  jobId: string
  traceId: string
  requestId: string
  input: PromptGenerationRequest
  queueDepth: number
}

type GenerationInput = {
  traceId: string
  jobId: string
  model: string
  metaPrompt: string
  userInput: string
}

type GenerationOutput = {
  generation: LangfuseGenerationHandle | null
  content: string
  usage: ModelUsage
  latencyMs: number
}

type JobOutput = {
  traceId: string
  jobId: string
  status: 'succeeded' | 'failed'
  output?: unknown
  error?: string
  usage?: ModelUsage
}

type LangfuseGenerationHandle = ReturnType<Langfuse['generation']>

const shouldTrace = () =>
  config.langfuseEnabled &&
  Boolean(config.langfusePublicKey) &&
  Boolean(config.langfuseSecretKey)

const langfuse = shouldTrace()
  ? new Langfuse({
      publicKey: config.langfusePublicKey,
      secretKey: config.langfuseSecretKey,
      baseUrl: config.langfuseBaseUrl,
      environment: config.langfuseEnvironment,
      flushAt: 1,
      fetchRetryCount: 2,
      requestTimeout: 5000
    })
  : null

const redact = <T>(value: T): T | string =>
  config.langfuseRedactIo ? '[redacted]' : value

export const isLangfuseConfigured = () => Boolean(langfuse)

export const createPromptTrace = (params: TraceInput) => {
  if (!langfuse || !params.input.trace_enabled) return

  langfuse.trace({
    id: params.traceId,
    name: 'call-agent.prompt-generation',
    input: redact({
      call_scenario: params.input.call_scenario,
      call_audience: params.input.call_audience,
      call_purpose: params.input.call_purpose,
      call_flow: params.input.call_flow,
      auxiliary_field: params.input.auxiliary_field
    }),
    version: params.input.meta_prompt_version || config.metaPromptVersion,
    metadata: {
      job_id: params.jobId,
      request_id: params.requestId,
      queue_depth: params.queueDepth,
      transport: config.llmTransport,
      model_requested: params.input.model || config.qwenModel,
      language: params.input.language
    },
    tags: ['prompt-generation', 'call-agent', 'outbound-v0']
  })
}

export const startModelGeneration = (params: GenerationInput) => {
  if (!langfuse) return null

  const generation = langfuse.generation({
    traceId: params.traceId,
    name: 'generate-system-prompt',
    model: params.model,
    input: redact({
      system_prompt: params.metaPrompt,
      user_input: params.userInput
    }),
    modelParameters: {
      temperature: 0.2,
      max_tokens: config.llmMaxTokens,
      transport: config.llmTransport
    },
    metadata: {
      job_id: params.jobId,
      meta_prompt_version: config.metaPromptVersion,
      qwen_thinking_enabled: config.qwenEnableThinking
    }
  })

  return generation
}

export const endModelGeneration = (params: GenerationOutput) => {
  if (!params.generation) return

  params.generation.end({
    output: redact(params.content),
    usage: params.usage
      ? {
          input: params.usage.input_tokens,
          output: params.usage.output_tokens,
          total: params.usage.total_tokens
        }
      : undefined,
    metadata: {
      latency_ms: params.latencyMs
    }
  })
}

export const updatePromptTrace = (params: JobOutput) => {
  if (!langfuse) return

  const level = params.status === 'succeeded' ? 'DEFAULT' : 'ERROR'
  langfuse.trace({
    id: params.traceId,
    output: redact(params.output),
    metadata: {
      job_id: params.jobId,
      status: params.status,
      error: params.error,
      usage: params.usage
    }
  })
  langfuse.event({
    traceId: params.traceId,
    name: `prompt-generation.${params.status}`,
    level,
    output: redact(params.output),
    metadata: {
      job_id: params.jobId,
      error: params.error
    }
  })
}

export const flushObservability = async () => {
  await langfuse?.flushAsync()
}
