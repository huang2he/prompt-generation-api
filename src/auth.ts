import type { RequestHandler, Response } from 'express'
import { createHash, timingSafeEqual } from 'node:crypto'
import { config } from './config.js'
import { failure } from './response.js'

const decodeBasicAuth = (authorization?: string) => {
  if (!authorization?.startsWith('Basic ')) return null
  const encoded = authorization.slice('Basic '.length).trim()
  const decoded = Buffer.from(encoded, 'base64').toString('utf8')
  const separator = decoded.indexOf(':')
  if (separator < 0) return null
  return {
    username: decoded.slice(0, separator),
    password: decoded.slice(separator + 1)
  }
}

export const requireBasicAuth: RequestHandler = (req, res, next) => {
  const credentials = decodeBasicAuth(req.header('authorization'))
  if (
    !credentials ||
    credentials.username !== config.apiKey ||
    credentials.password !== config.apiSecret
  ) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Prompt Generation API"')
    return failure(res, 401, 'Unauthorized')
  }
  next()
}

const webSessionValue = () =>
  createHash('sha256')
    .update(`prompt-generation-api:${config.webPassword}`)
    .digest('hex')

const parseCookies = (cookieHeader?: string) => {
  const cookies = new Map<string, string>()
  if (!cookieHeader) return cookies

  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=')
    if (separator < 0) continue
    const key = part.slice(0, separator).trim()
    const value = decodeURIComponent(part.slice(separator + 1).trim())
    cookies.set(key, value)
  }

  return cookies
}

const safeEqual = (a: string, b: string) => {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

export const isWebAuthenticated = (cookieHeader?: string) => {
  if (!config.webPassword) return true
  const token = parseCookies(cookieHeader).get(config.webSessionCookie)
  return Boolean(token && safeEqual(token, webSessionValue()))
}

export const requireWebAuth: RequestHandler = (req, res, next) => {
  if (isWebAuthenticated(req.header('cookie'))) {
    return next()
  }

  if (req.path.startsWith('/web/')) {
    return failure(res, 401, 'Web password required')
  }

  return res.redirect('/login')
}

export const createWebSession = (res: Response) => {
  const secure = config.webCookieSecure ? '; Secure' : ''
  res.setHeader(
    'Set-Cookie',
    `${config.webSessionCookie}=${webSessionValue()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400${secure}`
  )
}
