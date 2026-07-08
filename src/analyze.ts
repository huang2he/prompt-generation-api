import { config } from './config.js'
import { parseJsonObject } from './json-util.js'
import { loadAnalyzePrompt, renderAnalyzeInput } from './meta-prompt.js'
import { callModel, type ModelUsage } from './qwen.js'
import type { PromptGenerationRequest } from './schemas.js'

export type Blueprint = {
  scenario_type?: string
  industry?: string
  persona_gear?: string
  caller_legitimacy_frame?: string
  listener_state?: string
  trust_arc?: string[]
  golden_line_directions?: string[]
  core_objections?: Array<{ objection?: string; reframe?: string }>
  must_collect?: Array<{ item?: string; priority?: number }>
  compliance_redlines?: string[]
  [key: string]: unknown
}

export type AnalyzeResult = {
  blueprint: Blueprint
  raw: string
  usage: ModelUsage
  model: string
}

/**
 * Stage 1: turn the 5 fields into a structured battle blueprint.
 * Throws on parse/validation failure so the caller can decide to downgrade.
 */
export const analyze = async (
  input: PromptGenerationRequest,
  model: string = config.analyzeModel
): Promise<AnalyzeResult> => {
  const systemPrompt = await loadAnalyzePrompt()
  const userInput = renderAnalyzeInput(input)

  const result = await callModel({
    model,
    systemPrompt,
    userInput,
    maxTokens: config.analyzeMaxTokens,
    temperature: 0.3
  })

  const blueprint = parseJsonObject<Blueprint>(result.content)
  if (!blueprint) {
    throw new Error('analyze: model output was not valid JSON')
  }
  if (!blueprint.scenario_type || !blueprint.persona_gear) {
    throw new Error(
      'analyze: blueprint missing required fields scenario_type / persona_gear'
    )
  }

  return {
    blueprint,
    raw: result.content,
    usage: result.usage,
    model: result.model
  }
}
