import 'dotenv/config'

const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:8791'
const apiKey = process.env.API_KEY || 'local-key'
const apiSecret = process.env.API_SECRET || 'local-secret'
const basic = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')

const response = await fetch(
  `${baseUrl}/api/v2/call-agent/prompt-generations`,
  {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      call_scenario: '传奇手游老用户召回外呼',
      call_audience: '曾经玩过传奇类手游的用户，可能对新服有兴趣',
      call_purpose: '判断用户是否还有兴趣，并引导添加企业微信后续承接',
      call_flow:
        '开场说明身份 -> 问现在还玩不玩传奇 -> 处理忙/不玩/质疑身份 -> 同意后引导加微信 -> 收尾',
      auxiliary_field:
        '禁说：不能承诺装备、返钱、概率或充值收益。用户忙时低门槛加微信后续了解。'
    })
  }
)

console.log(response.status)
const created = await response.json()
console.log(JSON.stringify(created, null, 2))

const id = created?.data?.prompt_generation_id
if (!id) {
  throw new Error('missing prompt_generation_id')
}

for (let i = 0; i < 90; i++) {
  await new Promise((resolve) => setTimeout(resolve, 1000))
    const pollResponse = await fetch(
      `${baseUrl}/api/v2/call-agent/prompt-generations/${id}`,
    {
      headers: {
        Authorization: `Basic ${basic}`
      }
    }
  )
  const body = await pollResponse.json()
  const status = body?.data?.status
  console.log(`poll ${i + 1}: ${status}`)
  if (status === 'succeeded' || status === 'failed') {
    console.log(JSON.stringify(body, null, 2))
    break
  }
}
