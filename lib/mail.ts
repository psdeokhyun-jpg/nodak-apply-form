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

/**
 * 신청 폼과 같은 요가 톤(모래·세이지·흙).
 *
 * 메일 클라이언트는 <style> 블록과 웹폰트를 자주 지운다.
 * 그래서 전부 인라인 스타일 + table 레이아웃 + 시스템 세리프로 짠다.
 */
function htmlBody(m: ReceiptMail): string {
  const esc = (s: string) =>
    String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

  const SERIF = "Georgia,'Apple SD Gothic Neo','Nanum Myeongjo',serif"
  const SANS = "-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic',sans-serif"

  const SAND = '#f4f1ea'
  const PAPER = '#fbfaf7'
  const INK = '#3a3730'
  const SOFT = '#8b8578'
  const LINE = '#e0dbd0'
  const SAGE = '#7d8f7a'

  const row = (k: string, v: string) => `
    <tr>
      <td style="padding:9px 20px 9px 0;color:${SOFT};font-size:13px;white-space:nowrap;
                 border-bottom:1px solid ${LINE};font-family:${SANS}">${k}</td>
      <td style="padding:9px 0;color:${INK};font-size:14px;font-weight:600;
                 border-bottom:1px solid ${LINE};font-family:${SANS}">${esc(v)}</td>
    </tr>`

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>신청이 접수되었습니다</title>
</head>
<body style="margin:0;padding:0;background:${SAND}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
       style="background:${SAND};padding:40px 16px">
  <tr><td align="center">

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="max-width:520px;background:${PAPER};border:1px solid ${LINE};border-radius:14px">
      <tr><td style="padding:44px 34px 38px">

        <!-- 머리말 -->
        <p style="margin:0 0 22px;text-align:center;color:${SAGE};font-family:${SERIF};
                  font-size:11px;letter-spacing:.22em;text-transform:uppercase">
          &#9679;&nbsp;&nbsp;&nbsp;&#9679;&nbsp;&nbsp;&nbsp;&#9679;
        </p>

        <h1 style="margin:0 0 12px;text-align:center;color:${INK};font-family:${SERIF};
                   font-size:23px;font-weight:700;letter-spacing:.01em;line-height:1.45">
          신청이 접수되었습니다
        </h1>
        <p style="margin:0 0 34px;text-align:center;color:${SOFT};font-family:${SANS};
                  font-size:14.5px;line-height:1.7">
          ${esc(m.name)}님, 신청해주셔서 감사합니다.<br>수업에서 뵙겠습니다.
        </p>

        <!-- 신청 내용 -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
               style="border-collapse:collapse;border-top:1px solid ${LINE};margin-bottom:30px">
          ${row('프로그램', m.programName)}
          ${row('일정', m.programDate)}
          ${row('장소', m.programPlace)}
          ${row('참가비', won(m.price))}
          ${row('신청번호', m.applyNo)}
        </table>

        <!-- 안내 -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
               style="background:${SAND};border-left:2px solid ${SAGE};border-radius:0 8px 8px 0;
                      margin-bottom:30px">
          <tr><td style="padding:16px 18px;font-family:${SANS};font-size:13.5px;
                         color:${INK};line-height:1.7">
            <strong style="font-weight:600">아직 참가가 확정된 것은 아닙니다.</strong><br>
            <span style="color:${SOFT}">입금 안내를 곧 보내드리며, 입금이 확인되면 확정 안내를 드립니다.</span>
          </td></tr>
        </table>

        <!-- 내역 조회 -->
        <table role="presentation" cellpadding="0" cellspacing="0" align="center"
               style="margin:0 auto 34px">
          <tr><td style="border-radius:9px;background:${PAPER};border:1px solid ${LINE}">
            <a href="https://nodak-apply-form.vercel.app/my"
               style="display:inline-block;padding:13px 26px;color:${INK};text-decoration:none;
                      font-family:${SERIF};font-size:14px;font-weight:700;letter-spacing:.05em">
              내 신청 내역 보기
            </a>
          </td></tr>
        </table>

        <p style="margin:0;padding-top:22px;border-top:1px solid ${LINE};text-align:center;
                  color:${SOFT};font-family:${SANS};font-size:12px;line-height:1.7">
          문의사항은 이 메일에 회신해주세요.<br>
          제출하신 정보는 프로그램 운영 목적으로만 사용됩니다.
        </p>

      </td></tr>
    </table>

  </td></tr>
</table>
</body>
</html>`
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
