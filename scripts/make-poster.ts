#!/usr/bin/env bun
/**
 * 프로그램 홍보 포스터 생성기.
 *
 * 모집중인 프로그램을 Airtable에서 읽어 프로그램당 A4 포스터 HTML을 만든다.
 * QR 코드는 외부 API 없이 로컬에서 SVG로 생성해 인라인으로 심는다
 * (인쇄물이라 네트워크에 의존하면 안 된다).
 *
 * 실행: bun run scripts/make-poster.ts
 * 결과: poster/<슬러그>.html
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import QRCode from 'qrcode'
import { listOpenPrograms } from '../lib/airtable.js'

const FORM_URL = process.env.FORM_URL ?? 'https://nodak-apply-form.vercel.app'
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'poster')

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

const won = (n: number) => (n ? '₩' + Number(n).toLocaleString('ko-KR') : '무료')

/** 2026-09-18 -> { y:'2026', md:'09.18', dow:'금' } */
function splitDate(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return { y: '', md: esc(iso), dow: '' }
  const [, y, mo, d] = m
  const dow = ['일', '월', '화', '수', '목', '금', '토'][
    new Date(`${y}-${mo}-${d}T00:00:00`).getDay()
  ]
  return { y, md: `${mo}.${d}`, dow }
}

/** 파일명으로 쓸 수 있게 다듬는다 */
const slug = (s: string) =>
  s.replace(/\s+/g, '-').replace(/[^\p{L}\p{N}-]/gu, '').slice(0, 40)

function poster(p: any, qrSvg: string): string {
  const { y, md, dow } = splitDate(p.date)

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>${esc(p.name)} 포스터</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 0; }

  :root {
    --sand:  #f4f1ea;
    --paper: #fbfaf7;
    --ink:   #3a3730;
    --soft:  #8b8578;
    --line:  #ddd7cb;
    --sage:  #7d8f7a;
    --deep:  #5f6f5d;
    --clay:  #b08268;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  html, body {
    background: #d9d4c8;
    font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo",
      "Pretendard", system-ui, sans-serif;
    color: var(--ink);
    -webkit-font-smoothing: antialiased;
  }

  /* A4 = 210 x 297mm, 96dpi 기준 794 x 1123px */
  .sheet {
    width: 794px;
    height: 1123px;
    margin: 0 auto;
    background: var(--sand);
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    padding: 76px 68px 60px;
  }

  @media print {
    html, body { background: none; }
    .sheet { margin: 0; box-shadow: none; }
  }

  /* 은은한 배경 원 — 숨 쉬는 여백 */
  .halo {
    position: absolute;
    border-radius: 50%;
    border: 1px solid var(--line);
    pointer-events: none;
  }
  .halo.a { width: 560px; height: 560px; top: -170px; right: -190px; }
  .halo.b { width: 340px; height: 340px; bottom: -120px; left: -110px; }

  .inner { position: relative; display: flex; flex-direction: column; height: 100%; }

  /* ── 머리 ── */
  .mark { width: 62px; height: 62px; color: var(--sage); margin-bottom: 30px; }

  .kicker {
    font-family: "Gowun Batang", serif;
    font-size: 13px;
    letter-spacing: .34em;
    color: var(--sage);
    text-transform: uppercase;
    margin-bottom: 22px;
  }

  h1 {
    font-family: "Gowun Batang", serif;
    font-size: 62px;
    font-weight: 700;
    line-height: 1.24;
    letter-spacing: -.01em;
    margin-bottom: 24px;
    word-break: keep-all;
  }

  .tagline {
    font-size: 18px;
    line-height: 1.75;
    color: var(--soft);
    max-width: 30ch;
    word-break: keep-all;
  }

  /* ── 날짜 ── */
  .date {
    display: flex;
    align-items: flex-end;
    gap: 16px;
    margin-top: 52px;
    padding-bottom: 30px;
    border-bottom: 1px solid var(--line);
  }
  .date .big {
    font-family: "Gowun Batang", serif;
    font-size: 86px;
    font-weight: 700;
    line-height: .92;
    letter-spacing: -.02em;
    font-variant-numeric: tabular-nums;
  }
  .date .side { padding-bottom: 8px; line-height: 1.5; }
  .date .side .year { font-size: 17px; color: var(--soft); }
  .date .side .dow {
    font-family: "Gowun Batang", serif;
    font-size: 22px; font-weight: 700; color: var(--clay);
  }

  /* ── 정보 ── */
  .facts { margin-top: 30px; }
  .fact { display: flex; gap: 22px; padding: 15px 0; border-bottom: 1px solid var(--line); }
  .fact dt {
    width: 74px; flex: none;
    font-size: 13px; letter-spacing: .1em; color: var(--soft);
    padding-top: 5px;
  }
  .fact dd {
    font-family: "Gowun Batang", serif;
    font-size: 27px; font-weight: 700; line-height: 1.35;
    word-break: keep-all;
  }
  .fact dd .note { font-family: inherit; font-size: 15px; font-weight: 400; color: var(--soft); }

  /* ── 하단 QR ── */
  .foot {
    margin-top: auto;
    padding-top: 34px;
    display: flex;
    align-items: center;
    gap: 26px;
  }
  .qr {
    width: 152px; height: 152px; flex: none;
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 11px;
  }
  .qr svg { width: 100%; height: 100%; display: block; }

  .cta .go {
    font-family: "Gowun Batang", serif;
    font-size: 27px; font-weight: 700;
    margin-bottom: 8px;
  }
  .cta .desc { font-size: 15px; color: var(--soft); line-height: 1.65; margin-bottom: 12px; }
  .cta .url {
    font-size: 13px;
    color: var(--deep);
    letter-spacing: .01em;
    padding: 6px 12px;
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 7px;
    display: inline-block;
  }

  .seat {
    position: absolute;
    right: 0; bottom: 4px;
    text-align: right;
    font-size: 13px;
    color: var(--soft);
    line-height: 1.7;
  }
  .seat b {
    font-family: "Gowun Batang", serif;
    font-size: 19px; color: var(--clay); font-weight: 700;
  }
</style>
</head>
<body>
<div class="sheet">
  <div class="halo a"></div>
  <div class="halo b"></div>

  <div class="inner">
    <svg class="mark" viewBox="0 0 40 40" fill="none" stroke="currentColor"
         stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="20" cy="9.5" r="4"/>
      <path d="M20 15.2c-4.6 0-8.2 3.3-9 7.8"/>
      <path d="M20 15.2c4.6 0 8.2 3.3 9 7.8"/>
      <path d="M7.5 27c2.6-2.1 6.6-3.2 12.5-3.2S30 24.9 32.5 27"/>
      <path d="M7.5 27c1.6 2.7 6.3 4.2 12.5 4.2S30.9 29.7 32.5 27"/>
    </svg>

    <p class="kicker">${esc(p.category || '참가자 모집')}</p>
    <h1>${esc(p.name)}</h1>
    <p class="tagline">호흡을 고르고, 몸을 천천히 돌보는 시간.<br>지금 자리를 예약하세요.</p>

    <div class="date">
      <span class="big">${md}</span>
      <span class="side">
        <div class="year">${y}</div>
        <div class="dow">${dow}요일</div>
      </span>
    </div>

    <dl class="facts">
      <div class="fact"><dt>장소</dt><dd>${esc(p.place)}</dd></div>
      <div class="fact">
        <dt>참가비</dt>
        <dd>${won(p.price)}${p.capacity ? ` <span class="note">· 정원 ${p.capacity}명</span>` : ''}</dd>
      </div>
    </dl>

    <div class="foot">
      <div class="qr">${qrSvg}</div>
      <div class="cta">
        <div class="go">QR로 신청하기</div>
        <p class="desc">카메라로 QR을 비추면<br>신청 페이지가 열립니다.</p>
        <span class="url">${esc(FORM_URL.replace(/^https?:\/\//, ''))}</span>
      </div>
      ${p.capacity ? `<div class="seat">정원 <b>${p.capacity}</b>명<br>선착순 마감</div>` : ''}
    </div>
  </div>
</div>
</body>
</html>`
}

// ============================================

const programs = await listOpenPrograms()
if (!programs.length) {
  console.error('[ERROR] 모집중인 프로그램이 없습니다.')
  process.exit(1)
}

await mkdir(OUT_DIR, { recursive: true })

// QR은 프로그램마다 같은 신청 폼을 가리키므로 한 번만 만든다
const qrSvg = await QRCode.toString(FORM_URL, {
  type: 'svg',
  margin: 0,
  errorCorrectionLevel: 'M',
  color: { dark: '#3a3730', light: '#00000000' },
})

for (const p of programs) {
  const file = join(OUT_DIR, `${slug(p.name)}.html`)
  await writeFile(file, poster(p, qrSvg), 'utf8')
  console.log(`  생성  ${file}`)
}

console.log(`\n포스터 ${programs.length}장 생성 완료 (QR 대상: ${FORM_URL})`)
