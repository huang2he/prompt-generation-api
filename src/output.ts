// 第 6 章接受两种标题:新版「红线与禁令」(机审安全,避开"绝对"极限词)与旧版「绝对禁止事项」(兼容 v0/存量)。
const SECTION_ALTERNATIVES: string[][] = [
  ['# 角色设定'],
  ['# 任务目标'],
  ['# 对话原则'],
  ['# 对话流程'],
  ['# 抗拒与常见问题处理'],
  ['# 红线与禁令', '# 绝对禁止事项'],
  ['# 每轮自检与静默兜底']
]

const FORBIDDEN_SECTIONS = [
  '# 特殊情况处理',
  '# 通话后记录',
  '# 示例对话',
  '# 业务事实与变量',
  '# 成功、结束与交接'
]

const INCOMPLETE_ENDING_PATTERNS = [
  /[，、：；（(]$/,
  /(或者|以及|并|且|和|或|若|如果|当|则|与|及|第[一二三四五六七八九十]+次静默或)$/,
  /(下一步|回应|话术|目标|分支|禁止|自检|静默处理)[:：]?$/,
  /[“《「『]$/
]

export const cleanSystemPrompt = (value: string) => {
  let output = value.trim()
  output = output.replace(/^```(?:text|markdown|md)?\s*/i, '').trim()
  output = output.replace(/\s*```$/i, '').trim()
  output = output
    .replace(/^以下是.*?(?=#\s*角色设定)/s, '')
    .replace(/^这是.*?(?=#\s*角色设定)/s, '')
    .replace(/^可直接.*?(?=#\s*角色设定)/s, '')
    .trim()
  return output
}

export const validateSystemPrompt = (value: string) => {
  const missingSections = SECTION_ALTERNATIVES.filter(
    (alternatives) => !alternatives.some((section) => value.includes(section))
  ).map((alternatives) => alternatives[0])

  if (!value.startsWith('# 角色设定')) {
    return {
      ok: false,
      missingSections,
      reason: 'system_prompt must start with # 角色设定'
    }
  }

  if (missingSections.length) {
    return {
      ok: false,
      missingSections,
      reason: 'system_prompt missing required sections'
    }
  }

  const forbiddenSections = FORBIDDEN_SECTIONS.filter((section) =>
    value.includes(section)
  )
  if (forbiddenSections.length) {
    return {
      ok: false,
      missingSections,
      reason: `system_prompt contains forbidden sections: ${forbiddenSections.join(', ')}`
    }
  }

  const headings = value.match(/^# /gm) || []
  if (headings.length !== SECTION_ALTERNATIVES.length) {
    return {
      ok: false,
      missingSections,
      reason: `system_prompt must contain exactly ${SECTION_ALTERNATIVES.length} top-level sections`
    }
  }

  const finalSection = value.split('# 每轮自检与静默兜底')[1] || ''
  const trimmed = value.trim()
  if (
    finalSection.trim().length < 80 ||
    INCOMPLETE_ENDING_PATTERNS.some((pattern) => pattern.test(trimmed))
  ) {
    return {
      ok: false,
      missingSections,
      reason: 'system_prompt appears truncated near the end'
    }
  }

  return {
    ok: true,
    missingSections: [] as string[],
    reason: ''
  }
}
