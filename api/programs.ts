import { listOpenPrograms, json } from '../lib/airtable'

export const config = { runtime: 'edge' }

export default async function handler(): Promise<Response> {
  try {
    return json({ ok: true, programs: await listOpenPrograms() })
  } catch (e) {
    console.error('[programs]', e)
    return json({ ok: false, message: '프로그램을 불러오지 못했습니다.' }, 500)
  }
}
