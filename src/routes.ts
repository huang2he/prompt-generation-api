import type { RequestHandler } from 'express'
import { analyze } from './analyze.js'
import { config } from './config.js'
import { generateGoldenLines } from './golden-lines.js'
import {
  loadGeneratePrompt,
  loadLegacyMetaPrompt,
  renderAnalyzeInput,
  renderGenerateInput,
  renderUserInput,
  type GoldenLineCandidateSet
} from './meta-prompt.js'
import { cleanSystemPrompt, validateSystemPrompt } from './output.js'
import { callModel, type ModelResult, type ModelUsage } from './qwen.js'
import {
  createPromptTrace,
  endModelGeneration,
  flushObservability,
  startModelGeneration,
  updatePromptTrace
} from './observability.js'
import { accepted, createId, failure, success } from './response.js'
import {
  PromptGenerationRequest,
  type PromptGenerationData
} from './schemas.js'

type PromptJobStatus = 'pending' | 'running' | 'succeeded' | 'failed'
type Pipeline = 'A' | 'B' | 'C' | 'D'

type PromptJob = {
  prompt_generation_id: string
  trace_id: string
  status: PromptJobStatus
  created_at: string
  updated_at: string
  started_at?: string
  completed_at?: string
  error?: {
    detail: string
    details?: Record<string, unknown>
  }
  result?: PromptGenerationData
}

const jobs = new Map<string, PromptJob>()
const jobQueue: Array<{
  jobId: string
  input: PromptGenerationRequest
}> = []
let runningJobs = 0

const publicJob = (job: PromptJob) => ({
  prompt_generation_id: job.prompt_generation_id,
  trace_id: job.trace_id,
  status: job.status,
  created_at: job.created_at,
  updated_at: job.updated_at,
  started_at: job.started_at,
  completed_at: job.completed_at,
  error: job.error,
  result: job.result
})

const patchJob = (id: string, patch: Partial<PromptJob>) => {
  const job = jobs.get(id)
  if (!job) return
  jobs.set(id, {
    ...job,
    ...patch,
    updated_at: new Date().toISOString()
  })
}

const resolvePipeline = (input: PromptGenerationRequest): Pipeline => {
  const raw = (input.pipeline || config.defaultPipeline || 'C').toUpperCase()
  return (['A', 'B', 'C', 'D'].includes(raw) ? raw : 'C') as Pipeline
}

const sumUsage = (usages: ModelUsage[]): ModelUsage => {
  const acc = { input_tokens: 0, output_tokens: 0, total_tokens: 0 }
  let any = false
  for (const usage of usages) {
    if (!usage) continue
    any = true
    acc.input_tokens += usage.input_tokens || 0
    acc.output_tokens += usage.output_tokens || 0
    acc.total_tokens += usage.total_tokens || 0
  }
  return any ? acc : null
}

/** Run one model stage with a Langfuse span around it. */
const callStage = async (
  job: PromptJob,
  opts: {
    name: string
    model: string
    systemPrompt: string
    userInput: string
    maxTokens: number
    temperature: number
  }
): Promise<ModelResult> => {
  const generation = startModelGeneration({
    traceId: job.trace_id,
    jobId: job.prompt_generation_id,
    model: opts.model,
    metaPrompt: opts.systemPrompt,
    userInput: opts.userInput,
    name: opts.name,
    maxTokens: opts.maxTokens
  })
  const startedAt = Date.now()
  try {
    const result = await callModel({
      model: opts.model,
      systemPrompt: opts.systemPrompt,
      userInput: opts.userInput,
      maxTokens: opts.maxTokens,
      temperature: opts.temperature
    })
    endModelGeneration({
      generation,
      content: result.content,
      usage: result.usage,
      latencyMs: Date.now() - startedAt
    })
    return result
  } catch (error) {
    endModelGeneration({
      generation,
      content: `ERROR: ${error instanceof Error ? error.message : String(error)}`,
      usage: null,
      latencyMs: Date.now() - startedAt
    })
    throw error
  }
}

const drainQueue = () => {
  while (
    runningJobs < Math.max(1, config.maxConcurrentJobs) &&
    jobQueue.length > 0
  ) {
    const next = jobQueue.shift()
    if (!next) return
    runningJobs += 1
    void runPromptJob(next.jobId, next.input).finally(() => {
      runningJobs -= 1
      drainQueue()
    })
  }
}

const runPromptJob = async (
  jobId: string,
  input: PromptGenerationRequest
) => {
  const job = jobs.get(jobId)
  if (!job) return

  patchJob(jobId, {
    status: 'running',
    started_at: new Date().toISOString()
  })

  const requestedPipeline = resolvePipeline(input)
  const generateModel = input.model || config.generateModel
  const usages: ModelUsage[] = []
  let pipeline: Pipeline = requestedPipeline
  let downgradedFrom: string | undefined
  let blueprint: unknown
  let goldenSets: GoldenLineCandidateSet[] | undefined

  try {
    // Stage 1: analyze (pipelines C, D). On failure, downgrade to B (single-call).
    if (pipeline === 'C' || pipeline === 'D') {
      try {
        const generation = startModelGeneration({
          traceId: job.trace_id,
          jobId,
          model: config.analyzeModel,
          metaPrompt: '[analyze-v1 meta prompt]',
          userInput: renderAnalyzeInput(input),
          name: 'analyze-blueprint',
          maxTokens: config.analyzeMaxTokens
        })
        const startedAt = Date.now()
        const analyzeResult = await analyze(input, config.analyzeModel)
        endModelGeneration({
          generation,
          content: analyzeResult.raw,
          usage: analyzeResult.usage,
          latencyMs: Date.now() - startedAt
        })
        blueprint = analyzeResult.blueprint
        usages.push(analyzeResult.usage)
      } catch (error) {
        downgradedFrom = pipeline
        pipeline = 'B'
        updatePromptTrace({
          traceId: job.trace_id,
          jobId,
          status: 'failed',
          error: `analyze downgrade: ${error instanceof Error ? error.message : String(error)}`
        })
      }
    }

    // Stage 2: golden-line candidate pool (pipeline D, only when blueprint exists).
    if (pipeline === 'D' && blueprint) {
      const generation = startModelGeneration({
        traceId: job.trace_id,
        jobId,
        model: config.goldenLineModels.join('+'),
        metaPrompt: '[golden-lines-v1 meta prompt]',
        userInput: '[blueprint + fields]',
        name: 'golden-line-pool',
        maxTokens: config.goldenMaxTokens
      })
      const startedAt = Date.now()
      const golden = await generateGoldenLines(
        input,
        blueprint as never,
        config.goldenLineModels
      )
      endModelGeneration({
        generation,
        content: JSON.stringify({ sets: golden.sets, errors: golden.errors }),
        usage: sumUsage(golden.usages),
        latencyMs: Date.now() - startedAt
      })
      golden.usages.forEach((u) => usages.push(u))
      goldenSets = golden.sets
    }

    // Stage 3: generate the final system prompt.
    const usesLegacy = requestedPipeline === 'A'
    const systemPrompt = usesLegacy
      ? await loadLegacyMetaPrompt()
      : await loadGeneratePrompt()
    const userInput = usesLegacy
      ? renderUserInput(input)
      : renderGenerateInput(input, { blueprint, goldenLines: goldenSets })

    const modelResult = await callStage(job, {
      name: 'generate-system-prompt',
      model: generateModel,
      systemPrompt,
      userInput,
      maxTokens: config.llmMaxTokens,
      temperature: usesLegacy ? 0.2 : 0.4
    })
    usages.push(modelResult.usage)

    const systemPromptOut = cleanSystemPrompt(modelResult.content)
    const validation = validateSystemPrompt(systemPromptOut)
    if (!validation.ok) {
      updatePromptTrace({
        traceId: job.trace_id,
        jobId,
        status: 'failed',
        error: validation.reason,
        usage: sumUsage(usages)
      })
      patchJob(jobId, {
        status: 'failed',
        completed_at: new Date().toISOString(),
        error: {
          detail: 'Model output validation failed',
          details: {
            reason: validation.reason,
            missing_sections: validation.missingSections,
            pipeline,
            requested_pipeline: requestedPipeline
          }
        }
      })
      void flushObservability()
      return
    }

    const completedAt = new Date().toISOString()
    const data: PromptGenerationData = {
      prompt_generation_id: jobId,
      system_prompt: systemPromptOut,
      meta_prompt_version:
        input.meta_prompt_version || config.metaPromptVersion,
      pipeline,
      requested_pipeline: requestedPipeline,
      downgraded_from: downgradedFrom,
      model: modelResult.model,
      finish_reason: modelResult.finish_reason,
      usage: sumUsage(usages),
      blueprint,
      golden_lines: goldenSets,
      trace_id: job.trace_id,
      created_at: completedAt
    }

    updatePromptTrace({
      traceId: job.trace_id,
      jobId,
      status: 'succeeded',
      output: {
        prompt_generation_id: jobId,
        pipeline,
        system_prompt: systemPromptOut
      },
      usage: data.usage
    })
    patchJob(jobId, {
      status: 'succeeded',
      completed_at: completedAt,
      result: data
    })
  } catch (error) {
    // Log job failures with root cause — API 只回简短 detail,完整原因进服务日志
    console.error('[runPromptJob] error:', error)
    if (error instanceof Error && (error as Error & { cause?: unknown }).cause) {
      console.error('[runPromptJob] cause:', (error as Error & { cause?: unknown }).cause)
    }
    updatePromptTrace({
      traceId: job.trace_id,
      jobId,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Internal server error'
    })
    patchJob(jobId, {
      status: 'failed',
      completed_at: new Date().toISOString(),
      error: {
        detail: error instanceof Error ? error.message : 'Internal server error',
        details: { pipeline, requested_pipeline: requestedPipeline }
      }
    })
  } finally {
    void flushObservability()
  }
}

export const createPromptGeneration: RequestHandler = (req, res) => {
  const requestId = createId('req')
  const parsed = PromptGenerationRequest.safeParse(req.body)

  if (!parsed.success) {
    const details = Object.fromEntries(
      parsed.error.issues.map((issue) => [
        issue.path.join('.') || 'body',
        issue.message
      ])
    )
    return failure(res, 400, 'Invalid request payload', details, requestId)
  }

  const jobId = createId('pg')
  const traceId = createId('trace')
  const now = new Date().toISOString()
  const job: PromptJob = {
    prompt_generation_id: jobId,
    trace_id: traceId,
    status: 'pending',
    created_at: now,
    updated_at: now
  }
  jobs.set(jobId, job)
  createPromptTrace({
    jobId,
    traceId,
    requestId,
    input: parsed.data,
    queueDepth: jobQueue.length
  })

  jobQueue.push({
    jobId,
    input: parsed.data
  })
  drainQueue()

  return accepted(res, publicJob(job), requestId)
}

export const getPromptGeneration: RequestHandler = (req, res) => {
  const requestId = createId('req')
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
  const job = jobs.get(id)
  if (!job) {
    return failure(res, 404, 'Prompt generation not found', {}, requestId)
  }

  return success(res, publicJob(job), requestId)
}
