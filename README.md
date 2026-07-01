# Prompt Generation API

独立的本地后端服务：根据前端提交的 5 个文本字段，异步生成外呼智能体可直接使用的 `llm.system prompt`。

这个项目刻意独立于 `call-agent-console-dev-xqf`，后续由现有前端/BFF 调用本服务。

## 当前状态

- 已实现异步任务 API：`POST` 创建任务，`GET` 轮询结果。
- 系统 API 已实现 HTTP Basic Auth。
- 内置 Web demo 页面使用独立 Web 密码；页面调用 `/web/*` demo route。
- 已支持 `direct` 和 `dispatcher` 两种 LLM 调用方式。
- 已支持 Qwen OpenAI-compatible 接口，Qwen thinking 默认关闭。
- 已支持 Gemini OpenAI-compatible 接口，但通常通过 dispatcher 调用。
- 已接入可选 Langfuse tracing。
- 当前队列和任务存储都是内存实现，服务重启后任务记录会丢。
- 当前没有任务列表接口，只能通过 `prompt_generation_id` 查询单个任务。

## API

主路由：

```text
POST /api/v2/call-agent/prompt-generations
GET  /api/v2/call-agent/prompt-generations/:id
```

兼容路由：

```text
POST /conversational-ai/v2/projects/:appId/prompt-generations
GET  /conversational-ai/v2/projects/:appId/prompt-generations/:id
```

健康检查：

```text
GET /health
```

内置页面：

```text
GET /
POST /web/prompt-generations
GET  /web/prompt-generations/:id
```

默认端口是 `8791`。

```bash
PORT=8791 bun run dev
```

## 鉴权

系统 API 路由使用 HTTP Basic Auth：

```text
/api/v2/call-agent/prompt-generations
/conversational-ai/v2/projects/:appId/prompt-generations
```

Web demo route 不使用 Basic Auth，但会校验 Web 登录 cookie：

```text
/web/prompt-generations
```

默认本地账号来自 `.env`：

```env
API_KEY=local-key
API_SECRET=local-secret
```

Web 页面密码来自 `.env`：

```env
WEB_PASSWORD=prompt-demo
WEB_SESSION_COOKIE=pg_web_session
WEB_COOKIE_SECURE=false
```

curl 示例：

```bash
curl -u local-key:local-secret \
  http://localhost:8791/api/v2/call-agent/prompt-generations/{prompt_generation_id}
```

## 本地启动

```bash
cd /Users/huangzhe/Desktop/prompt-generation-api
bun install
bun run dev
```

打开页面：

```text
http://localhost:8791/
```

如果需要复制默认配置：

```bash
cp .env.example .env
```

本地 mock 测试：

```bash
MOCK_QWEN=true LLM_TRANSPORT=direct bun run test:local
```

注意：如果本机已有其他服务占用端口，请确认 `.env` 里的 `PORT=8791`。

## 内置前端

服务内置一个最小可用页面：

```text
public/index.html
```

功能：

```text
填写 5 个字段
POST 创建生成任务
轮询 GET 查询状态
展示 system_prompt
复制结果
展示 trace_id、任务状态、耗时、token usage
```

页面和 API 同源。页面调用 `/web/prompt-generations`，只需要输入 Web 密码；正式系统调用仍使用 `/api/v2/call-agent/prompt-generations` 并带 Basic Auth。

浏览器只能看到 `/web/*` 请求和页面代码，看不到 `.env` 里的 dispatcher 地址密码、Qwen/Gemini key、Langfuse secret。任何人即使扒出 curl，也必须带有效 Web session cookie 才能调用 `/web/*`。

## 复制目录到服务器部署

这个项目可以作为一个独立目录复制到服务器运行，但服务器需要先安装 Node.js 22+ 或 Bun。推荐部署方式：

```text
用户浏览器 -> Nginx:80 -> prompt-generation-api:8791
```

建议复制这些文件/目录：

```text
package.json
bun.lock
tsconfig.json
.env
src/
prompts/
public/
README.md
```

不要依赖本机的 `node_modules/` 和 `dist/`，到服务器后重新安装依赖并重新 build。

服务启动示例：

```bash
cd /opt/prompt-generation-api
bun install --production
bun run build
PORT=8791 bun run start
```

如果服务器不用 Bun，也可以用 npm，但仍建议保留 Bun lock 作为当前开发环境记录：

```bash
npm install --omit=dev
npm run build
PORT=8791 npm run start
```

注意：`npm install --omit=dev` 后如果没有 TypeScript 编译器，`npm run build` 会失败。更稳妥的方式是在服务器执行一次完整安装和 build，然后再按需 prune：

```bash
npm install
npm run build
npm prune --omit=dev
PORT=8791 npm run start
```

公网部署前至少要改掉默认鉴权和 Web 密码：

```env
API_KEY=your-api-client-name
API_SECRET=strong-random-api-secret
WEB_PASSWORD=strong-web-page-password
WEB_COOKIE_SECURE=false
```

如果已经通过域名和 HTTPS 访问，再设置：

```env
WEB_COOKIE_SECURE=true
```

Nginx 最小反代示例：

```nginx
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:8791;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

公网部署时，如果开放系统 API，至少要改掉默认 Basic Auth：

```env
API_KEY=your-admin-name
API_SECRET=strong-random-password
WEB_PASSWORD=another-strong-random-password
```

生产不建议长期裸 IP + HTTP，后续应加域名和 HTTPS。

## 请求字段

```json
{
  "call_scenario": "贷款线索回访，用户在广告页提交过咨询。",
  "call_audience": "25-45 岁有资金周转需求的用户。",
  "call_purpose": "确认用户是否仍有需求，并预约人工顾问回访。",
  "call_flow": "开场说明身份和来电原因；确认是否方便；确认需求；预约人工；结束。",
  "auxiliary_field": "不要承诺额度、利率、审批结果；不要索要验证码。"
}
```

字段限制：

```text
call_scenario    required, max 1200 chars
call_audience    required, max 1500 chars
call_purpose     required, max 1500 chars
call_flow        required, max 5000 chars
auxiliary_field  optional, max 20000 chars
language         optional, default zh-CN
model            optional, overrides QWEN_MODEL
trace_enabled    optional, default true
```

## 创建任务

```bash
BASIC_AUTH="$(printf '%s' 'local-key:local-secret' | base64)"

curl -X POST "http://localhost:8791/api/v2/call-agent/prompt-generations" \
  -H "Authorization: Basic ${BASIC_AUTH}" \
  -H "Content-Type: application/json" \
  -d '{
    "call_scenario": "贷款线索回访",
    "call_audience": "提交过贷款咨询的用户",
    "call_purpose": "确认意向并预约人工回访",
    "call_flow": "开场，确认方便，确认需求，预约人工，结束",
    "auxiliary_field": "不要承诺额度、利率、审批结果。"
  }'
```

返回 `202 Accepted`：

```json
{
  "reason": "0",
  "detail": "accepted",
  "data": {
    "prompt_generation_id": "pg_xxx",
    "trace_id": "trace_xxx",
    "status": "pending",
    "created_at": "2026-07-01T07:10:14.003Z",
    "updated_at": "2026-07-01T07:10:14.003Z"
  },
  "request_id": "req_xxx",
  "ts": 1782889814
}
```

说明：`POST` 成功只代表任务创建成功，不代表模型已经生成成功。前端必须进入 loading 状态并轮询 `GET`。

## 查询任务

```bash
curl -u local-key:local-secret \
  "http://localhost:8791/api/v2/call-agent/prompt-generations/pg_xxx"
```

任务状态：

```text
pending    已入队，尚未开始
running    正在调用模型
succeeded  生成成功
failed     生成失败
```

成功响应：

```json
{
  "reason": "0",
  "detail": "success",
  "data": {
    "prompt_generation_id": "pg_xxx",
    "trace_id": "trace_xxx",
    "status": "succeeded",
    "created_at": "2026-07-01T07:10:14.003Z",
    "updated_at": "2026-07-01T07:10:48.933Z",
    "started_at": "2026-07-01T07:10:14.004Z",
    "completed_at": "2026-07-01T07:10:48.932Z",
    "result": {
      "prompt_generation_id": "pg_xxx",
      "system_prompt": "# 身份与任务\n...",
      "meta_prompt_version": "outbound-v0.1.0",
      "model": "qwen3.7-max",
      "usage": {
        "input_tokens": 3129,
        "output_tokens": 1642,
        "total_tokens": 4771
      },
      "trace_id": "trace_xxx",
      "created_at": "2026-07-01T07:10:48.932Z"
    }
  },
  "request_id": "req_xxx",
  "ts": 1782889848
}
```

## LLM 调用方式

### Direct

服务直接调用模型厂商 OpenAI-compatible API。

```env
MOCK_QWEN=false
LLM_TRANSPORT=direct
QWEN_API_KEY=your-key
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen3.7-max
QWEN_ENABLE_THINKING=false
LLM_MAX_TOKENS=2400
```

### Dispatcher

服务先调用 dispatcher，再由 dispatcher 调用 Qwen/Gemini 等模型。

```env
MOCK_QWEN=false
LLM_TRANSPORT=dispatcher
DISPATCHER_BASE_URL=http://47.100.137.178:8080
DISPATCHER_USERNAME=your-username
DISPATCHER_PASSWORD=your-password
DISPATCHER_PROXY=true
```

Dispatcher 只负责文本模型调用。ASR、附件解析、文档解析仍应放在本业务 API 或上游服务里完成。

## 输出长度和延迟

`LLM_MAX_TOKENS=2400` 是输出长度护栏。真实测试里，延迟主要由 output tokens 决定，而不是输入字段长度。代码会检查模型 `finish_reason`，如果因为 token 上限导致截断，会把任务标记为 `failed`，不会返回半截 prompt。

当前 meta prompt 目标：

```text
1200-2000 中文字
7 个核心中文章节
只输出最终 system prompt
不输出分析报告、IR、测试集、解释性文字
```

如果真实生成仍偏慢，优先优化方向是：

```text
减少输出章节和示例
使用更快模型
改成流式返回
拆成骨架生成 + 可选细化
```

## Langfuse Tracing

Langfuse 是可选观测系统。开启后，每个生成任务会创建一个 trace，trace id 与 API 返回的 `trace_id` 一致。

Japan region 配置示例：

```env
LANGFUSE_ENABLED=true
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_BASE_URL=https://jp.cloud.langfuse.com
LANGFUSE_ENVIRONMENT=local
LANGFUSE_REDACT_IO=false
```

如果不希望原始用户字段和生成 prompt 进入 Langfuse：

```env
LANGFUSE_REDACT_IO=true
```

Langfuse Tracing 页面里，一次 API 请求通常会显示 3 行 observation：

```text
call-agent.prompt-generation      根 trace
generate-system-prompt            模型 generation
prompt-generation.succeeded       成功事件
```

要查看单次调用，搜索完整 trace id：

```text
traceId:trace_xxx
```

也可以直接打开：

```text
https://jp.cloud.langfuse.com/project/{projectId}/traces/{trace_id}
```

注意：如果 secret key 暴露过，应在 Langfuse Project Settings 里 revoke 旧 key 并重新生成。

## Health

```bash
curl http://localhost:8791/health
```

示例响应：

```json
{
  "ok": true,
  "service": "prompt-generation-api",
  "mock_qwen": false,
  "llm_transport": "dispatcher",
  "langfuse_enabled": true,
  "langfuse_configured": true
}
```

## 已知限制

- 当前任务队列是进程内数组，任务存储是进程内 `Map`。
- 服务重启会丢失所有任务。
- 当前没有 `GET /prompt-generations` 列表接口。
- 当前没有 Redis/DB worker，没有跨实例并发控制。
- 当前没有速率限制和租户级 quota。
- 当前 Basic Auth 适合本地/demo，生产应接入正式鉴权。
- 当前 Langfuse flush 是异步，不阻塞主链路；观测系统失败不应影响生成 API。

## 生产化 TODO

- 用 Redis/DB 持久化 job、result、status、error。
- 增加任务列表和按 `trace_id`/时间/状态查询。
- 增加租户、用户、项目维度鉴权和配额。
- 增加请求幂等键，避免前端重复点击创建多个任务。
- 增加模型超时、重试、fallback 策略。
- 增加 prompt version 管理和灰度。
- 增加结构化 eval，用 bad case 回归测试 meta prompt。
