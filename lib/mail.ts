/**
 * 신청 접수 확인 메일 발송 (Gmail SMTP).
 *
 * Edge 런타임에서는 동작하지 않는다 — SMTP는 raw TCP라 Node 런타임이 필요하다.
 * 이 파일을 쓰는 함수는 반드시 runtime 을 nodejs 로 둘 것.
 *
 * 필요한 환경변수:
 *   GMAIL_USER         보내는 사람 주소 (예: you@gmail.com)
 *   GMAIL_APP_PASSWORD 구글 앱 비밀번호 16자리 (일반 계정 비밀번호 아님)
 */

import nodemailer from 'nodemailer'

export interface ReceiptMail {
  to: string
  name: string
  applyNo: string
  programName: string
  programDate: string
  programPlace: string
  price: number
}

const won = (n: number) => (n ? `₩${Number(n).toLocaleString('ko-KR')}` : '무료')

function textBody(m: ReceiptMail): string {
  return [
    `${m.name}님, 신청이 접수되었습니다.`,
    ``,
    `  프로그램  ${m.programName}`,
    `  일정      ${m.programDate}`,
    `  장소      ${m.programPlace}`,
    `  참가비    ${won(m.price)}`,
    `  신청번호  ${m.applyNo}`,
    ``,
    `아직 참가가 확정된 것은 아닙니다.`,
    `입금 안내를 곧 보내드리며, 입금이 확인되면 확정 안내를 드립니다.`,
    ``,
    `신청 내역은 아래에서 확인하실 수 있습니다.`,
    `https://nodak-apply-form.vercel.app/my`,
    ``,
    `문의사항은 이 메일에 회신해주세요.`,
  ].join('\n')
}

function htmlBody(m: ReceiptMail): string {
  const esc = (s: string) =>
    String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

  const row = (k: string, v: string) =>
    `<tr>
       <td style="padding:6px 16px 6px 0;color:#6f6f68;font-size:14px;white-space:nowrap">${k}</td>
       <td style="padding:6px 0;color:#1c1c1a;font-size:14px;font-weight:600">${esc(v)}</td>
     </tr>`

  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo',sans-serif;
              max-width:520px;margin:0 auto;padding:32px 20px;color:#1c1c1a;line-height:1.6">
  <h1 style="font-size:20px;font-weight:650;margin:0 0 8px">신청이 접수되었습니다</h1>
  <p style="margin:0 0 24px;color:#6f6f68;font-size:14px">${esc(m.name)}님, 신청해주셔서 감사합니다.</p>

  <div style="border:1px solid #e2e2dc;border-radius:12px;padding:18px 20px;margin-bottom:24px">
    <table style="border-collapse:collapse;width:100%">
      ${row('프로그램', m.programName)}
      ${row('일정', m.programDate)}
      ${row('장소', m.programPlace)}
      ${row('참가비', won(m.price))}
      ${row('신청번호', m.applyNo)}
    </table>
  </div>

  <div style="background:#fdf6e3;border-radius:9px;padding:14px 16px;margin-bottom:24px;font-size:14px">
    <strong>아직 참가가 확정된 것은 아닙니다.</strong><br>
    입금 안내를 곧 보내드리며, 입금이 확인되면 확정 안내를 드립니다.
  </div>

  <p style="font-size:14px;margin:0 0 24px">
    신청 내역은
    <a href="https://nodak-apply-form.vercel.app/my" style="color:#1c1c1a">여기</a>에서
    이름과 전화번호로 확인하실 수 있습니다.
  </p>

  <p style="font-size:12px;color:#9b9a92;margin:0;border-top:1px solid #e2e2dc;padding-top:16px">
    문의사항은 이 메일에 회신해주세요.
  </p>
</div>`
}

/**
 * 접수 확인 메일을 보낸다.
 *
 * 메일 발송 실패가 신청 자체를 실패시키면 안 된다 — 레코드는 이미 저장된 상태다.
 * 호출하는 쪽에서 결과를 보고 로그만 남기고 넘어갈 것.
 */
export async function sendReceipt(m: ReceiptMail): Promise<{ sent: boolean; error?: string }> {
  const user = process.env.GMAIL_USER
  // 앱 비밀번호는 보통 "abcd efgh ijkl mnop" 형태로 복사된다. 공백은 빼고 쓴다.
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, '')

  if (!user || !pass) {
    return { sent: false, error: 'GMAIL_USER / GMAIL_APP_PASSWORD 미설정' }
  }

  try {
    const transport = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    })

    await transport.sendMail({
      from: `프로그램 운영팀 <${user}>`,
      to: m.to,
      subject: `[접수] ${m.programName} 신청이 접수되었습니다 (${m.applyNo})`,
      text: textBody(m),
      html: htmlBody(m),
    })

    return { sent: true }
  } catch (e) {
    return { sent: false, error: (e as Error).message }
  }
}
