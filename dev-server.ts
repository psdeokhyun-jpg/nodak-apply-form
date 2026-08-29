#!/usr/bin/env bun
/**
 * 로컬 개발 서버.
 *
 * 배포본(Vercel)은 api/*.ts 를 쓴다. 이 파일은 같은 lib/airtable.ts 를
 * 그대로 불러서 로컬에서 동일하게 돌려보기 위한 얇은 래퍼다.
 *
 * 실행: bun run server.ts   (AIRTABLE_API_KEY 환경변수 필요)
 */

import programsHandler from './api/programs'
import { apply as applyHandler } from './api/apply'
import myHandler from './api/my'

const PORT = Number(process.env.PORT ?? 3000)

if (!process.env.AIRTABLE_API_KEY) {
  console.error('[ERROR] AIRTABLE_API_KEY 환경변수가 없습니다.')
  console.error('  export AIRTABLE_API_KEY="pat..." 후 다시 실행하세요.')
  process.exit(1)
}

const page = (name: string) =>
  Bun.file(new URL(`./public/${name}`, import.meta.url)).text()

const [indexHtml, myHtml] = await Promise.all([page('index.html'), page('my.html')])

const serveHtml = (body: string) =>
  new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })

Bun.serve({
  port: PORT,
  async fetch(req) {
    const { pathname } = new URL(req.url)

    if (req.method === 'GET' && pathname === '/') return serveHtml(indexHtml)
    if (req.method === 'GET' && pathname === '/my') return serveHtml(myHtml)

    if (pathname === '/api/programs') return programsHandler()
    if (pathname === '/api/apply') return applyHandler(req)
    if (pathname === '/api/my') return myHandler(req)

    return new Response('Not Found', { status: 404 })
  },
})

console.log(`신청 폼 서버 실행 중 → http://localhost:${PORT}`)
console.log(`  신청 폼      http://localhost:${PORT}/`)
console.log(`  내역 조회    http://localhost:${PORT}/my`)
