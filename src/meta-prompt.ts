import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { config } from './config.js'
import type { PromptGenerationRequest } from './schemas.js'

export const loadMetaPrompt = async () => {
  const promptPath = resolve(process.cwd(), config.metaPromptPath)
  return readFile(promptPath, 'utf8')
}

export const renderUserInput = (input: PromptGenerationRequest) => {
  return [
    '<call_scenario>',
    input.call_scenario,
    '</call_scenario>',
    '',
    '<call_audience>',
    input.call_audience,
    '</call_audience>',
    '',
    '<call_purpose>',
    input.call_purpose,
    '</call_purpose>',
    '',
    '<call_flow>',
    input.call_flow,
    '</call_flow>',
    '',
    '<auxiliary_field>',
    input.auxiliary_field || '',
    '</auxiliary_field>'
  ].join('\n')
}
