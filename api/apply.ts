import { submit, validate, formatPhone, rateLimited, clientIp, json } from '../lib/airtable'

export const config = { runtime: 'edge' }

/** 공개 배포라 신청 API에도 속도 제한을 건다 (IP당 분당 5건) */
const MAX_PER_MIN = 5

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ ok: false, message: '잘못된 요청입니다.' }, 405)

  const ip = clientIp(req.headers)
  if (rateLimited(`apply:${ip}`, MAX_PER_MIN)) {
    return json({ ok: false, message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }, 429)
  }

  let body: Record<string, string>
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, message: '잘못된 요청입니다.' }, 400)
  }

  const err = validate(body)
  if (err === 'BOT') {
    // 봇에게는 성공한 것처럼 보이게 하고 실제로는 저장하지 않는다
    console.warn('[apply] honeypot triggered', ip)
    return json({ ok: true, applyNo: '-', memberIsNew: false, name: body.name ?? '' })
  }
  if (err) return json({ ok: false, message: err }, 400)

  try {
    const result = await submit(body)
    console.log(
      `[apply] ${body.name} / ${formatPhone(body.phone)} -> ` +
        (result.ok ? `${result.applyNo} (${result.memberIsNew ? '신규' : '기존'} 멤버)` : result.code)
    )
    return json(result, result.ok ? 200 : 409)
  } catch (e) {
    console.error('[apply]', e)
    return json(
      { ok: false, message: '신청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' },
      500
    )
  }
}
