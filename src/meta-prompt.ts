import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { config } from './config.js'
import type { PromptGenerationRequest } from './schemas.js'

const loadPromptFile = (relativePath: string) =>
  readFile(resolve(process.cwd(), relativePath), 'utf8')

/** Legacy single-call meta prompt (pipeline A). */
export const loadLegacyMetaPrompt = () =>
  loadPromptFile(config.legacyMetaPromptPath)

export const loadAnalyzePrompt = () =>
  loadPromptFile(config.analyzeMetaPromptPath)

export const loadGeneratePrompt = () =>
  loadPromptFile(config.generateMetaPromptPath)

export const loadGoldenPrompt = () =>
  loadPromptFile(config.goldenMetaPromptPath)

const tag = (name: string, value: string) =>
  `<${name}>\n${value}\n</${name}>`

/** The 5 user fields rendered as XML-tagged blocks. */
const renderFields = (input: PromptGenerationRequest) =>
  [
    tag('call_scenario', input.call_scenario),
    tag('call_audience', input.call_audience),
    tag('call_purpose', input.call_purpose),
    tag('call_flow', input.call_flow),
    tag('agent_identity', input.agent_identity),
    tag('auxiliary_field', input.auxiliary_field || '')
  ].join('\n\n')

/** Legacy path + pipeline B(no blueprint) use just the fields. */
export const renderUserInput = renderFields

export const renderAnalyzeInput = renderFields

export const renderGoldenInput = (
  input: PromptGenerationRequest,
  blueprint: unknown
) =>
  [renderFields(input), tag('battle_blueprint', JSON.stringify(blueprint, null, 2))].join(
    '\n\n'
  )

export type GoldenLineCandidateSet = {
  model: string
  candidates: unknown
}

export const renderGenerateInput = (
  input: PromptGenerationRequest,
  extras: {
    blueprint?: unknown
    goldenLines?: GoldenLineCandidateSet[]
  } = {}
) => {
  const parts = [renderFields(input)]

  // Single-stage (pipeline B) sends only the fields — no empty tags.
  // Staged pipelines (C/D) still attach their artifacts when present.
  if (extras.blueprint) {
    parts.push(tag('battle_blueprint', JSON.stringify(extras.blueprint, null, 2)))
  }

  if (extras.goldenLines && extras.goldenLines.length) {
    parts.push(tag('golden_line_candidates', JSON.stringify(extras.goldenLines, null, 2)))
  }

  return parts.join('\n\n')
}
