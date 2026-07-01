import type { RequestHandler } from 'express'
import { config } from './config.js'
import { loadMetaPrompt, renderUserInput } from './meta-prompt.js'
import { cleanSystemPrompt, validateSystemPrompt } from './output.js'
import { callQwen } from './qwen.js'
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

  try {
    const metaPrompt = await loadMetaPrompt()
    const userInput = renderUserInput(input)
    const model = input.model || config.qwenModel
    const generation = startModelGeneration({
      traceId: job.trace_id,
      jobId,
      model,
      metaPrompt,
      userInput
    })
    const startedAt = Date.now()
    const modelResult = await callQwen({
      systemPrompt: metaPrompt,
      userInput,
      model: input.model
    })
    endModelGeneration({
      generation,
      content: modelResult.content,
      usage: modelResult.usage,
      latencyMs: Date.now() - startedAt
    })

    const systemPrompt = cleanSystemPrompt(modelResult.content)
    const validation = validateSystemPrompt(systemPrompt)
    if (!validation.ok) {
      updatePromptTrace({
        traceId: job.trace_id,
        jobId,
        status: 'failed',
        error: validation.reason,
        usage: modelResult.usage
      })
      patchJob(jobId, {
        status: 'failed',
        completed_at: new Date().toISOString(),
        error: {
          detail: 'Model output validation failed',
          details: {
            reason: validation.reason,
            missing_sections: validation.missingSections
          }
        }
      })
      void flushObservability()
      return
    }

    const completedAt = new Date().toISOString()
    const data: PromptGenerationData = {
      prompt_generation_id: jobId,
      system_prompt: systemPrompt,
      meta_prompt_version: input.meta_prompt_version || config.metaPromptVersion,
      model: modelResult.model,
      finish_reason: modelResult.finish_reason,
      usage: modelResult.usage,
      trace_id: job.trace_id,
      created_at: completedAt
    }

    updatePromptTrace({
      traceId: job.trace_id,
      jobId,
      status: 'succeeded',
      output: {
        prompt_generation_id: jobId,
        system_prompt: systemPrompt
      },
      usage: modelResult.usage
    })
    patchJob(jobId, {
      status: 'succeeded',
      completed_at: completedAt,
      result: data
    })
  } catch (error) {
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
        detail: error instanceof Error ? error.message : 'Internal server error'
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
