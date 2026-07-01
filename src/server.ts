import cors from 'cors'
import express from 'express'
import { resolve } from 'node:path'
import {
  createWebSession,
  isWebAuthenticated,
  requireBasicAuth,
  requireWebAuth
} from './auth.js'
import { config } from './config.js'
import { isLangfuseConfigured } from './observability.js'
import {
  createPromptGeneration,
  getPromptGeneration
} from './routes.js'

const app = express()

app.use(cors())
app.use(express.json({ limit: '256kb' }))
app.use(express.urlencoded({ extended: false }))

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'prompt-generation-api',
    mock_qwen: config.mockQwen,
    llm_transport: config.llmTransport,
    langfuse_enabled: config.langfuseEnabled,
    langfuse_configured: isLangfuseConfigured()
  })
})

app.post(
  '/api/v2/call-agent/prompt-generations',
  requireBasicAuth,
  createPromptGeneration
)

app.get(
  '/api/v2/call-agent/prompt-generations/:id',
  requireBasicAuth,
  getPromptGeneration
)

app.post(
  '/conversational-ai/v2/projects/:appId/prompt-generations',
  requireBasicAuth,
  createPromptGeneration
)

app.get(
  '/conversational-ai/v2/projects/:appId/prompt-generations/:id',
  requireBasicAuth,
  getPromptGeneration
)

app.get('/login', (req, res) => {
  if (isWebAuthenticated(req.header('cookie'))) {
    return res.redirect('/')
  }

  return res.type('html').send(`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>访问 Prompt 生成器</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: "Songti SC", serif; background: #f2efe8; color: #20201d; }
      form { width: min(420px, calc(100vw - 40px)); padding: 30px; border: 1px solid #d8d0c1; border-radius: 24px; background: #fffaf0; box-shadow: 0 24px 70px rgba(55,43,28,.16); }
      h1 { margin: 0 0 10px; font-size: 28px; }
      p { margin: 0 0 22px; color: #6e6a61; line-height: 1.6; }
      input { width: 100%; box-sizing: border-box; border: 1px solid #cfc5b3; border-radius: 14px; padding: 13px 14px; font-size: 16px; }
      button { width: 100%; margin-top: 14px; border: 0; border-radius: 999px; padding: 13px 18px; background: #171816; color: #fff8ec; font-weight: 700; cursor: pointer; }
      .error { color: #b42318; min-height: 20px; margin-top: 12px; }
    </style>
  </head>
  <body>
    <form method="post" action="/login">
      <h1>访问密码</h1>
      <p>请输入 Web 访问密码。这个密码只保护演示页面，不是系统 API Basic Auth。</p>
      <input name="password" type="password" autofocus autocomplete="current-password" />
      <button type="submit">进入</button>
      <div class="error">${req.query.error ? '密码错误' : ''}</div>
    </form>
  </body>
</html>`)
})

app.post('/login', (req, res) => {
  if (!config.webPassword || req.body?.password === config.webPassword) {
    createWebSession(res)
    return res.redirect('/')
  }

  return res.redirect('/login?error=1')
})

app.post('/web/prompt-generations', requireWebAuth, createPromptGeneration)
app.get('/web/prompt-generations/:id', requireWebAuth, getPromptGeneration)

app.use(
  '/',
  requireWebAuth,
  express.static(resolve(process.cwd(), 'public'), {
    index: 'index.html'
  })
)

app.listen(config.port, () => {
  console.log(`prompt-generation-api listening on http://localhost:${config.port}`)
})
