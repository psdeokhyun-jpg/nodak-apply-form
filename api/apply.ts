import { submit, validate, formatPhone, rateLimited, clientIp, json } from '../lib/airtable'
import { sendReceipt } from '../lib/mail'

// Edge가 아니라 Node 런타임이어야 한다 — 접수 확인 메일이 SMTP(raw TCP)를 쓴다.
export const config = { runtime: 'nodejs' }

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

  let result
  try {
    result = await submit(body)
  } catch (e) {
    console.error('[apply]', e)
    return json(
      { ok: false, message: '신청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' },
      500
    )
  }

  if (!result.ok) {
    console.log(`[apply] ${body.name} -> ${result.code}`)
    return json(result, 409)
  }

  // 레코드는 이미 저장됐다. 메일이 실패해도 신청은 성공으로 응답한다.
  const mail = await sendReceipt({
    to: result.email,
    name: result.name,
    applyNo: result.applyNo,
    programName: result.program.name,
    programDate: result.program.date,
    programPlace: result.program.place,
    price: result.program.price,
  })

  if (!mail.sent) console.error(`[mail] 발송 실패 (${result.applyNo}): ${mail.error}`)

  console.log(
    `[apply] ${body.name} / ${formatPhone(body.phone)} -> ${result.applyNo} ` +
      `(${result.memberIsNew ? '신규' : '기존'} 멤버, 메일 ${mail.sent ? '발송' : '실패'})`
  )

  return json({
    ok: true,
    applyNo: result.applyNo,
    memberIsNew: result.memberIsNew,
    name: result.name,
    mailSent: mail.sent,
  })
}
