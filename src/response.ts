import type { Response } from 'express'

export const nowTs = () => Math.floor(Date.now() / 1000)

export const createId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

export const success = <T>(
  res: Response,
  data: T,
  requestId = createId('req')
) => {
  return res.status(200).json({
    reason: '0',
    detail: 'success',
    data,
    request_id: requestId,
    ts: nowTs()
  })
}

export const accepted = <T>(
  res: Response,
  data: T,
  requestId = createId('req')
) => {
  return res.status(202).json({
    reason: '0',
    detail: 'accepted',
    data,
    request_id: requestId,
    ts: nowTs()
  })
}

export const failure = (
  res: Response,
  status: number,
  detail: string,
  details: Record<string, unknown> = {},
  requestId = createId('req')
) => {
  return res.status(status).json({
    reason: String(status),
    detail,
    data: null,
    details,
    request_id: requestId,
    ts: nowTs()
  })
}
