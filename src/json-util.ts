/** Extract the first top-level JSON object from a model response. */
export const extractJsonObject = (text: string): string | null => {
  let t = text.trim()
  t = t
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start < 0 || end < 0 || end <= start) return null
  return t.slice(start, end + 1)
}

export const parseJsonObject = <T = Record<string, unknown>>(
  text: string
): T | null => {
  const json = extractJsonObject(text)
  if (!json) return null
  try {
    const parsed = JSON.parse(json)
    return parsed && typeof parsed === 'object' ? (parsed as T) : null
  } catch {
    return null
  }
}
