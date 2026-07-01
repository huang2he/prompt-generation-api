import { z } from 'zod'

const requiredText = (field: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${field} is required`)
    .max(max, `${field} exceeds maximum length ${max}`)

export const PromptGenerationRequest = z.object({
  call_scenario: requiredText('call_scenario', 1200),
  call_audience: requiredText('call_audience', 1500),
  call_purpose: requiredText('call_purpose', 1500),
  call_flow: requiredText('call_flow', 5000),
  auxiliary_field: z
    .string()
    .trim()
    .max(20000, 'auxiliary_field exceeds maximum length 20000')
    .optional()
    .default(''),
  language: z.string().default('zh-CN').optional(),
  model: z.enum(['qwen3.7-plus', 'qwen3.7-max']).optional(),
  meta_prompt_version: z.string().optional(),
  trace_enabled: z.boolean().optional().default(true)
})

export type PromptGenerationRequest = z.infer<
  typeof PromptGenerationRequest
>

export type PromptGenerationData = {
  prompt_generation_id: string
  system_prompt: string
  meta_prompt_version: string
  model: string
  finish_reason?: string
  usage: {
    input_tokens?: number
    output_tokens?: number
    total_tokens?: number
  } | null
  trace_id: string
  created_at: string
}
