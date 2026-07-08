import { config } from './config.js'
import { parseJsonObject } from './json-util.js'
import {
  loadGoldenPrompt,
  renderGoldenInput,
  type GoldenLineCandidateSet
} from './meta-prompt.js'
import { callModel, type ModelUsage } from './qwen.js'
import type { Blueprint } from './analyze.js'
import type { PromptGenerationRequest } from './schemas.js'

export type GoldenLinesResult = {
  sets: GoldenLineCandidateSet[]
  usages: ModelUsage[]
  errors: Array<{ model: string; error: string }>
}

/**
 * Stage 2 (pipeline D): generate golden-line candidates from a pool of models
 * in parallel. Each model that fails (network / bad JSON) is skipped, not fatal.
 */
export const generateGoldenLines = async (
  input: PromptGenerationRequest,
  blueprint: Blueprint,
  models: string[] = config.goldenLineModels
): Promise<GoldenLinesResult> => {
  const systemPrompt = await loadGoldenPrompt()
  const userInput = renderGoldenInput(input, blueprint)

  const settled = await Promise.all(
    models.map(async (model) => {
      try {
        const result = await callModel({
          model,
          systemPrompt,
          userInput,
          maxTokens: config.goldenMaxTokens,
          temperature: 0.85
        })
        const candidates = parseJsonObject(result.content)
        if (!candidates) {
          return {
            set: null,
            usage: result.usage,
            error: { model, error: 'golden: output was not valid JSON' }
          }
        }
        return {
          set: { model, candidates } as GoldenLineCandidateSet,
          usage: result.usage,
          error: null
        }
      } catch (error) {
        return {
          set: null,
          usage: null,
          error: {
            model,
            error: error instanceof Error ? error.message : 'golden: unknown error'
          }
        }
      }
    })
  )

  return {
    sets: settled.map((s) => s.set).filter((s): s is GoldenLineCandidateSet => Boolean(s)),
    usages: settled.map((s) => s.usage),
    errors: settled.map((s) => s.error).filter((e): e is { model: string; error: string } => Boolean(e))
  }
}
