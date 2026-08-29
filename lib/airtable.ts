/**
 * Airtable 연동 + 도메인 로직.
 *
 * 로컬 개발 서버(server.ts)와 Vercel Functions(api/*.ts)가 이 파일을 공유한다.
 * 런타임에 종속된 코드(Bun.sleep 등)를 쓰지 않는다.
 *
 * Airtable 키는 서버에서만 읽는다. 브라우저로 절대 내려보내지 않는다.
 */

const BASE_ID = process.env.AIRTABLE_BASE_ID ?? 'appBHziM1LClZiG2R'

const TBL_PROGRAM = process.env.AIRTABLE_TBL_PROGRAM ?? 'tblvyiyFObgvYXCR5'
const TBL_APPLY = process.env.AIRTABLE_TBL_APPLY ?? 'tblk9CAC7oeKgKC2P'
const TBL_MEMBER = process.env.AIRTABLE_TBL_MEMBER ?? 'tblqbTl2kBifCEVQO'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ============================================
// Airtable client
// ============================================

async function airtable(
  path: string,
  init: RequestInit = {},
  query: Record<string, string | string[]> = {}
): Promise<any> {
  const apiKey = process.env.AIRTABLE_API_KEY
  if (!apiKey) throw new Error('AIRTABLE_API_KEY 환경변수가 없습니다.')

  const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${path}`)
  for (const [k, v] of Object.entries(query)) {
    if (Array.isArray(v)) v.forEach((item) => url.searchParams.append(k, item))
    else url.searchParams.set(k, v)
  }

  // Airtable rate limit(5 req/s) 대응: 429면 지수 백오프로 재시도
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    })

    if (res.status === 429) {
      await sleep(2 ** attempt * 400)
      continue
    }
    if (!res.ok) {
      throw new Error(`Airtable ${res.status}: ${await res.text()}`)
    }
    return res.json()
  }
  throw new Error('Airtable rate limit: 재시도 초과')
}

/** filterByFormula 문자열 리터럴 이스케이프 (formula injection 방지) */
function esc(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

// ============================================
// 정규화 / 검증
// ============================================

export const digits = (s: string) => String(s ?? '').replace(/\D/g, '')
const normEmail = (s: string) => String(s ?? '').trim().toLowerCase()

/** 010-1234-5678 형태로 통일 */
export function formatPhone(raw: string): string {
  const d = digits(raw)
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
  return String(raw ?? '').trim()
}

export function validate(f: Record<string, string>): string | null {
  if (!f.programId) return '프로그램을 선택해주세요.'
  if (!f.name?.trim()) return '이름을 입력해주세요.'
  if (f.name.trim().length > 40) return '이름이 너무 깁니다.'
  if (digits(f.phone).length < 10) return '전화번호를 정확히 입력해주세요.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email ?? '')) return '이메일 형식이 올바르지 않습니다.'
  if ((f.motivation ?? '').length > 1000) return '신청동기는 1000자 이내로 입력해주세요.'
  if ((f.org ?? '').length > 60) return '소속이 너무 깁니다.'
  // 봇 차단용 honeypot: 사람에겐 보이지 않는 필드다. 채워져 있으면 봇.
  if (f.website) return 'BOT'
  return null
}

// ============================================
// 도메인 로직
// ============================================

/** 모집중인 프로그램만 폼에 노출 */
export async function listOpenPrograms() {
  const data = await airtable(TBL_PROGRAM, {}, { filterByFormula: '{모집상태}="모집중"' })
  return data.records
    .map((r: any) => ({
      id: r.id,
      name: r.fields['프로그램명'],
      category: r.fields['구분'] ?? '',
      date: r.fields['날짜'] ?? '',
      place: r.fields['장소'] ?? '',
      capacity: r.fields['정원'] ?? null,
      price: r.fields['금액'] ?? 0,
    }))
    .sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)))
}

/** 프로그램 전체를 id -> 정보 맵으로 (내역 조회엔 마감/종료 프로그램도 나와야 한다) */
async function programMap(): Promise<Map<string, any>> {
  const data = await airtable(TBL_PROGRAM, {}, { maxRecords: '500' })
  return new Map(
    data.records.map((r: any) => [
      r.id,
      {
        name: r.fields['프로그램명'],
        date: r.fields['날짜'] ?? '',
        place: r.fields['장소'] ?? '',
        price: r.fields['금액'] ?? 0,
        status: r.fields['모집상태'] ?? '',
      },
    ])
  )
}

/** 프로그램 id가 실재하는지 (임의 레코드 id를 밀어넣는 걸 막는다) */
async function programExists(id: string): Promise<boolean> {
  try {
    await airtable(`${TBL_PROGRAM}/${id}`)
    return true
  } catch {
    return false
  }
}

/** 기존 멤버 찾기: 전화번호 또는 이메일이 일치하면 동일인 */
async function findMember(phone: string, email: string) {
  const formula = `OR(
    SUBSTITUTE(SUBSTITUTE({전화번호}, "-", ""), " ", "") = "${esc(digits(phone))}",
    LOWER({이메일}) = "${esc(normEmail(email))}"
  )`
  const data = await airtable(TBL_MEMBER, {}, { filterByFormula: formula, maxRecords: '1' })
  return data.records[0] ?? null
}

const MBTI_TYPES = new Set([
  'INTJ', 'INTP', 'ENTJ', 'ENTP', 'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'ISTP', 'ISFP', 'ESTP', 'ESFP',
])
const BLOOD_TYPES = new Set(['A', 'B', 'O', 'AB'])
const GENDERS = new Set(['여성', '남성', '기타', '응답 안 함'])

/**
 * 선택 입력 프로필 항목.
 * 값이 목록에 없으면 통째로 버린다 — 임의 값이 Airtable 선택지를 오염시키면 안 된다.
 */
function profileFields(f: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (f.org?.trim()) out['소속'] = f.org.trim()
  if (f.gender && GENDERS.has(f.gender)) out['성별'] = f.gender
  if (f.mbti && MBTI_TYPES.has(f.mbti.toUpperCase())) out['MBTI'] = f.mbti.toUpperCase()
  if (f.blood && BLOOD_TYPES.has(f.blood.toUpperCase())) out['혈액형'] = f.blood.toUpperCase()

  const height = Number(f.height)
  if (Number.isFinite(height) && height >= 100 && height <= 250) out['키'] = Math.round(height)

  const weight = Number(f.weight)
  if (Number.isFinite(weight) && weight >= 25 && weight <= 250) out['몸무게'] = Math.round(weight)

  return out
}

/** 기존 멤버면 재사용하고 최신 연락처로 갱신, 없으면 새로 생성 */
async function upsertMember(f: Record<string, string>) {
  const fields: Record<string, unknown> = {
    이름: f.name.trim(),
    전화번호: formatPhone(f.phone),
    이메일: normEmail(f.email),
    ...profileFields(f),
  }

  const existing = await findMember(f.phone, f.email)

  if (existing) {
    // 연락처는 최신값으로 갱신. 유입경로는 최초 유입을 보존하려고 비어있을 때만 채운다.
    const patch: Record<string, unknown> = { ...fields }
    if (f.source && !existing.fields['유입경로']) patch['유입경로'] = f.source

    const updated = await airtable(`${TBL_MEMBER}/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields: patch }),
    })
    return { id: updated.id, isNew: false, name: updated.fields['이름'] }
  }

  if (f.source) fields['유입경로'] = f.source
  const created = await airtable(TBL_MEMBER, {
    method: 'POST',
    body: JSON.stringify({ fields }),
  })
  return { id: created.id, isNew: true, name: created.fields['이름'] }
}

/** 같은 사람이 같은 프로그램에 이미 신청했는지 */
async function alreadyApplied(memberId: string, programId: string) {
  const data = await airtable(
    TBL_APPLY,
    {},
    { filterByFormula: 'AND({멤버}!="", {프로그램}!="")', maxRecords: '1000' }
  )
  return data.records.some(
    (r: any) =>
      (r.fields['멤버'] ?? []).includes(memberId) &&
      (r.fields['프로그램'] ?? []).includes(programId)
  )
}

/** APP-YYYY-NNN 다음 번호 */
async function nextApplyNo(): Promise<string> {
  const year = new Date().getFullYear()
  // Airtable은 배열 파라미터를 fields[] 형식으로 받는다
  const data = await airtable(TBL_APPLY, {}, { 'fields[]': ['신청번호'], maxRecords: '1000' })
  const prefix = `APP-${year}-`
  let max = 0
  for (const r of data.records) {
    const no = String(r.fields['신청번호'] ?? '')
    if (no.startsWith(prefix)) {
      const n = parseInt(no.slice(prefix.length), 10)
      if (!Number.isNaN(n) && n > max) max = n
    }
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`
}

export type SubmitResult =
  | { ok: false; code: string; message: string }
  | {
      ok: true
      applyNo: string
      memberIsNew: boolean
      name: string
      email: string
      program: { name: string; date: string; place: string; price: number }
    }

export async function submit(f: Record<string, string>): Promise<SubmitResult> {
  const programs = await programMap()
  const program = programs.get(f.programId)
  if (!program) {
    return { ok: false, code: 'BAD_PROGRAM', message: '선택한 프로그램을 찾을 수 없습니다.' }
  }

  // 중복 검사를 멤버 갱신보다 먼저 한다.
  // 순서가 반대면, 거절될 신청도 기존 멤버의 이름·연락처를 덮어쓴다
  // (남의 이메일을 오타로 적은 사람이 그 사람 정보를 오염시킨다).
  const existing = await findMember(f.phone, f.email)
  if (existing && (await alreadyApplied(existing.id, f.programId))) {
    return { ok: false, code: 'DUPLICATE', message: '이미 이 프로그램에 신청하셨습니다.' }
  }

  const member = await upsertMember(f)

  const record = await airtable(TBL_APPLY, {
    method: 'POST',
    body: JSON.stringify({
      fields: {
        신청번호: await nextApplyNo(),
        프로그램: [f.programId],
        멤버: [member.id],
        이름: f.name.trim(),
        전화번호: formatPhone(f.phone),
        이메일: normEmail(f.email),
        신청일: new Date().toISOString().slice(0, 10),
        신청동기: f.motivation?.trim() ?? '',
        신청상태: '접수',
        입금상태: '미입금',
      },
    }),
  })

  return {
    ok: true,
    applyNo: record.fields['신청번호'] as string,
    memberIsNew: member.isNew,
    name: member.name as string,
    // 접수 확인 메일에 쓰인다 (브라우저 응답에도 포함되지만 본인이 방금 입력한 값이다)
    email: normEmail(f.email),
    program: {
      name: (program.name ?? '') as string,
      date: (program.date ?? '') as string,
      place: (program.place ?? '') as string,
      price: (program.price ?? 0) as number,
    },
  }
}

// ============================================
// 신청 내역 조회
// ============================================

/** hong@example.com -> ho**@example.com */
function maskEmail(email: string): string {
  const [id, domain] = email.split('@')
  if (!domain) return email
  return `${id.slice(0, 2)}${'*'.repeat(Math.max(id.length - 2, 1))}@${domain}`
}

/**
 * 전화번호만으로 열어주면 남의 번호를 아는 사람이 그 사람 내역을 다 볼 수 있다.
 * 이름까지 함께 맞아야 열어준다 (강한 인증은 아니지만 최소한의 방어).
 */
export async function lookup(name: string, phone: string) {
  const d = digits(phone)
  const nameMatches = (v: unknown) => String(v ?? '').trim() === name.trim()
  const phoneEq = (field: string) =>
    `SUBSTITUTE(SUBSTITUTE({${field}}, "-", ""), " ", "") = "${esc(d)}"`

  // 1차: 멤버 테이블의 (최신) 연락처로 찾기
  const byMember = await airtable(
    TBL_MEMBER,
    {},
    { filterByFormula: phoneEq('전화번호'), maxRecords: '5' }
  )
  let member = byMember.records.find((r: any) => nameMatches(r.fields['이름']))

  // 2차: 예전 신청서에 적었던 번호로도 찾아준다.
  // 멤버 병합 때 연락처를 최신값으로 덮어써서, 과거 번호는 신청 레코드에만 남아 있다.
  if (!member) {
    const byApply = await airtable(
      TBL_APPLY,
      {},
      { filterByFormula: phoneEq('전화번호'), maxRecords: '10' }
    )
    const hit = byApply.records.find(
      (r: any) => nameMatches(r.fields['이름']) && (r.fields['멤버'] ?? []).length
    )
    if (hit) member = await airtable(`${TBL_MEMBER}/${hit.fields['멤버'][0]}`)
  }

  if (!member) return { ok: true, found: false, applications: [] }

  const applyIds: string[] = member.fields['신청'] ?? []
  const programs = await programMap()

  const applications = []
  for (const id of applyIds) {
    const rec = await airtable(`${TBL_APPLY}/${id}`)
    const f = rec.fields
    const p = programs.get((f['프로그램'] ?? [])[0]) ?? {}
    applications.push({
      applyNo: f['신청번호'] ?? '',
      appliedAt: f['신청일'] ?? '',
      applyStatus: f['신청상태'] ?? '',
      payStatus: f['입금상태'] ?? '',
      program: {
        name: p.name ?? '(삭제된 프로그램)',
        date: p.date ?? '',
        place: p.place ?? '',
        price: p.price ?? 0,
      },
    })
  }
  applications.sort((a, b) => String(b.appliedAt).localeCompare(String(a.appliedAt)))

  return {
    ok: true,
    found: true,
    name: member.fields['이름'],
    email: maskEmail(String(member.fields['이메일'] ?? '')),
    applications,
  }
}

// ============================================
// 운영 현황 (관리자)
// ============================================

/** 자리를 차지하는 상태. 대기·취소는 정원에서 빼지 않는다. */
const SEAT_TAKING = new Set(['확정', '접수'])

const APPLY_STATUSES = ['확정', '접수', '대기', '취소'] as const
const PAY_STATUSES = ['입금확인', '미입금', '환불', '무료참여'] as const

export interface ProgramStatus {
  id: string
  name: string
  category: string
  date: string
  place: string
  status: string
  capacity: number | null
  price: number
  total: number
  seatsTaken: number
  seatsLeft: number | null
  applyBreakdown: Record<string, number>
  payBreakdown: Record<string, number>
  revenue: number
}

/**
 * 프로그램별 신청 현황 집계.
 * 개인정보는 담지 않는다 — 숫자만 반환한다.
 */
export async function statusSummary() {
  const [programsRes, applyRes] = await Promise.all([
    airtable(TBL_PROGRAM, {}, { maxRecords: '500' }),
    airtable(
      TBL_APPLY,
      {},
      { 'fields[]': ['프로그램', '신청상태', '입금상태'], maxRecords: '5000' }
    ),
  ])

  const zero = (keys: readonly string[]) =>
    Object.fromEntries(keys.map((k) => [k, 0])) as Record<string, number>

  const programs: ProgramStatus[] = programsRes.records.map((r: any) => ({
    id: r.id,
    name: r.fields['프로그램명'] ?? '(이름 없음)',
    category: r.fields['구분'] ?? '',
    date: r.fields['날짜'] ?? '',
    place: r.fields['장소'] ?? '',
    status: r.fields['모집상태'] ?? '',
    capacity: typeof r.fields['정원'] === 'number' ? r.fields['정원'] : null,
    price: r.fields['금액'] ?? 0,
    total: 0,
    seatsTaken: 0,
    seatsLeft: null,
    applyBreakdown: zero(APPLY_STATUSES),
    payBreakdown: zero(PAY_STATUSES),
    revenue: 0,
  }))

  const byId = new Map(programs.map((p) => [p.id, p]))
  const overall = {
    total: 0,
    apply: zero(APPLY_STATUSES),
    pay: zero(PAY_STATUSES),
    orphan: 0, // 프로그램 링크가 없는 신청
  }

  for (const rec of applyRes.records) {
    const f = rec.fields
    const pid = (f['프로그램'] ?? [])[0]
    const applyStatus = f['신청상태'] ?? '(미지정)'
    const payStatus = f['입금상태'] ?? '(미지정)'

    overall.total++
    if (applyStatus in overall.apply) overall.apply[applyStatus]++
    if (payStatus in overall.pay) overall.pay[payStatus]++

    const p = pid ? byId.get(pid) : undefined
    if (!p) {
      overall.orphan++
      continue
    }

    p.total++
    if (applyStatus in p.applyBreakdown) p.applyBreakdown[applyStatus]++
    if (payStatus in p.payBreakdown) p.payBreakdown[payStatus]++
    if (SEAT_TAKING.has(applyStatus)) p.seatsTaken++
    if (payStatus === '입금확인') p.revenue += p.price
  }

  for (const p of programs) {
    p.seatsLeft = p.capacity === null ? null : Math.max(p.capacity - p.seatsTaken, 0)
  }

  programs.sort((a, b) => {
    // 모집중을 위로, 그다음 날짜순
    const rank = (s: string) => (s === '모집중' ? 0 : s === '마감' ? 1 : 2)
    return rank(a.status) - rank(b.status) || String(a.date).localeCompare(String(b.date))
  })

  return {
    ok: true as const,
    generatedAt: new Date().toISOString(),
    programs,
    overall,
    totalRevenue: programs.reduce((s, p) => s + p.revenue, 0),
  }
}

// ============================================
// 후기 분석
// ============================================

const TBL_REVIEW = process.env.AIRTABLE_TBL_REVIEW ?? 'tbleZr7RMrb5jMUwb'

/**
 * 프로그램별 별점 집계와 최근 후기.
 *
 * 후기 본문은 작성자가 공개를 전제로 쓴 글이라 이름과 함께 보여주되,
 * 연락처 같은 식별 정보는 담지 않는다.
 */
export async function reviewSummary(recentLimit = 12) {
  const [programsRes, reviewRes, memberRes] = await Promise.all([
    airtable(TBL_PROGRAM, {}, { maxRecords: '500' }),
    airtable(TBL_REVIEW, {}, { maxRecords: '5000' }),
    airtable(TBL_MEMBER, {}, { 'fields[]': ['이름'], maxRecords: '5000' }),
  ])

  const memberName = new Map<string, string>(
    memberRes.records.map((r: any) => [r.id, r.fields['이름'] ?? ''])
  )

  const emptyDist = () => ({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }) as Record<number, number>

  interface ProgramReview {
    id: string
    name: string
    date: string
    status: string
    count: number
    sum: number
    average: number | null
    dist: Record<number, number>
  }

  const programs: ProgramReview[] = programsRes.records.map((r: any) => ({
    id: r.id,
    name: r.fields['프로그램명'] ?? '(이름 없음)',
    date: r.fields['날짜'] ?? '',
    status: r.fields['모집상태'] ?? '',
    count: 0,
    sum: 0,
    average: null,
    dist: emptyDist(),
  }))
  const byId = new Map<string, ProgramReview>(programs.map((p) => [p.id, p]))

  const overallDist = emptyDist()
  let overallSum = 0
  let overallCount = 0

  const recent: {
    id: string
    reviewNo: string
    name: string
    program: string
    stars: number
    text: string
    writtenAt: string
  }[] = []

  for (const rec of reviewRes.records) {
    const f = rec.fields
    if (f['공개'] === false) continue // 비공개 후기는 집계·목록에서 제외

    const stars = Number(f['별점'])
    const pid = (f['프로그램'] ?? [])[0]
    const p = pid ? byId.get(pid) : undefined

    if (Number.isInteger(stars) && stars >= 1 && stars <= 5) {
      overallDist[stars]++
      overallSum += stars
      overallCount++
      if (p) {
        p.dist[stars]++
        p.sum += stars
        p.count++
      }
    }

    recent.push({
      id: rec.id,
      reviewNo: f['후기번호'] ?? '',
      name: memberName.get((f['멤버'] ?? [])[0]) ?? '익명',
      program: p?.name ?? '(삭제된 프로그램)',
      stars: Number.isFinite(stars) ? stars : 0,
      text: f['후기'] ?? '',
      writtenAt: f['작성일'] ?? '',
    })
  }

  for (const p of programs) {
    p.average = p.count ? Math.round((p.sum / p.count) * 10) / 10 : null
  }

  // 후기가 있는 프로그램을 위로, 그다음 평점 높은 순
  programs.sort(
    (a: ProgramReview, b: ProgramReview) =>
      (b.count ? 1 : 0) - (a.count ? 1 : 0) || (b.average ?? 0) - (a.average ?? 0)
  )

  recent.sort((a, b) => String(b.writtenAt).localeCompare(String(a.writtenAt)))

  return {
    ok: true as const,
    generatedAt: new Date().toISOString(),
    programs,
    overall: {
      count: overallCount,
      average: overallCount ? Math.round((overallSum / overallCount) * 10) / 10 : null,
      dist: overallDist,
    },
    recent: recent.slice(0, recentLimit),
  }
}

// ============================================
// 속도 제한
// ============================================

/**
 * IP당 요청 횟수 제한.
 *
 * 주의: 서버리스에서는 인스턴스마다 메모리가 따로라 완벽하지 않다.
 * 무차별 대입을 늦추는 정도지, 확실한 차단이 필요하면 Upstash/KV 같은
 * 외부 저장소로 옮겨야 한다.
 */
const hits = new Map<string, number[]>()

export function rateLimited(ip: string, max: number, windowMs = 60_000): boolean {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs)
  recent.push(now)
  hits.set(ip, recent)
  if (hits.size > 5000) hits.clear() // 메모리 방어
  return recent.length > max
}

/** 프록시 뒤에서 클라이언트 IP 추출 */
export function clientIp(headers: Headers): string {
  return (
    headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    headers.get('x-real-ip') ||
    'unknown'
  )
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
