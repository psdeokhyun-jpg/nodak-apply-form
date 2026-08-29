import { statusSummary, rateLimited, clientIp, json } from '../lib/airtable.js'

export const config = { runtime: 'edge' }

/** 비밀번호 대입을 늦춘다 (IP당 분당 8회) */
const MAX_PER_MIN = 8

/**
 * 타이밍 공격을 피하려고 길이와 무관하게 전체를 비교한다.
 * (운영자용 공유 비밀번호 수준의 방어다 — 계정 인증이 아니다.)
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ ok: false, message: '잘못된 요청입니다.' }, 405)

  const ip = clientIp(req.headers)
  if (rateLimited(`status:${ip}`, MAX_PER_MIN)) {
    return json({ ok: false, message: '시도가 많습니다. 1분 후 다시 시도해주세요.' }, 429)
  }

  const expected = process.env.ADMIN_PASSWORD
  if (!expected) {
    console.error('[status] ADMIN_PASSWORD 미설정')
    return json({ ok: false, message: '관리자 비밀번호가 설정되지 않았습니다.' }, 500)
  }

  let body: Record<string, string>
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, message: '잘못된 요청입니다.' }, 400)
  }

  if (!body.password || !safeEqual(body.password, expected)) {
    return json({ ok: false, message: '비밀번호가 올바르지 않습니다.' }, 401)
  }

  try {
    return json(await statusSummary())
  } catch (e) {
    console.error('[status]', e)
    return json({ ok: false, message: '현황을 불러오지 못했습니다.' }, 500)
  }
}
