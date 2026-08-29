import { lookup, digits, formatPhone, rateLimited, clientIp, json } from '../lib/airtable'

export const config = { runtime: 'edge' }

/** 번호를 넣어보며 남의 내역을 캐는 걸 늦춘다 (IP당 분당 6회) */
const MAX_PER_MIN = 6

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ ok: false, message: '잘못된 요청입니다.' }, 405)

  const ip = clientIp(req.headers)
  if (rateLimited(`my:${ip}`, MAX_PER_MIN)) {
    return json({ ok: false, message: '조회 시도가 많습니다. 1분 후 다시 시도해주세요.' }, 429)
  }

  let body: Record<string, string>
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, message: '잘못된 요청입니다.' }, 400)
  }

  if (!body.name?.trim() || digits(body.phone).length < 10) {
    return json({ ok: false, message: '이름과 전화번호를 정확히 입력해주세요.' }, 400)
  }

  try {
    const result = await lookup(body.name, body.phone)
    console.log(
      `[my] ${body.name} / ${formatPhone(body.phone)} -> ` +
        (result.found ? `${result.applications.length}건` : '없음')
    )
    return json(result)
  } catch (e) {
    console.error('[my]', e)
    return json({ ok: false, message: '조회 중 오류가 발생했습니다.' }, 500)
  }
}
