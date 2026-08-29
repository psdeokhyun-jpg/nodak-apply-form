# 프로그램 신청 폼

Airtable 베이스 `클코워크숍`(appBHziM1LClZiG2R)에 연결된 신청 폼입니다.

## 배포된 주소

- 신청 폼: https://nodak-apply-form.vercel.app
- 내역 조회: https://nodak-apply-form.vercel.app/my

`main` 브랜치에 푸시하면 Vercel이 자동 배포한다.
즉시 배포하려면 `vercel --prod`.

레포: https://github.com/psdeokhyun-jpg/nodak-apply-form

## 파일 구조

| 경로 | 역할 |
|---|---|
| `public/index.html` | 신청 폼 |
| `public/my.html` | 내역 조회 |
| `api/*.ts` | Vercel Edge Functions (배포본이 쓰는 API) |
| `lib/airtable.ts` | Airtable 연동 + 도메인 로직 (로컬/배포 공유) |
| `dev-server.ts` | 로컬 개발 서버 |

> `dev-server.ts` 를 `server.ts` 로 되돌리지 말 것. Vercel이 루트의
> `server.ts` 를 서버 진입점으로 자동 인식해서 `api/` 구성을 무시한다.

## 실행

```bash
bun run dev-server.ts
```

`http://localhost:3000` 접속.

필요한 환경변수 (이미 `~/.zshrc`에 설정돼 있음):

| 변수 | 설명 |
|---|---|
| `AIRTABLE_API_KEY` | Airtable PAT. **필수** |
| `AIRTABLE_BASE_ID` | 기본값 `appBHziM1LClZiG2R` |
| `PORT` | 기본값 `3000` |

## 왜 서버가 필요한가

Airtable 키를 브라우저에 내려보내면 폼을 여는 누구나 그 키로 베이스 전체를
읽고 쓸 수 있다. 그래서 키는 서버에만 두고, 브라우저는 이 서버의
`/api/*`만 호출한다. 멤버 중복 확인도 Airtable 조회가 필요해 서버에서 처리한다.

## 동작

- `GET /api/programs` — `모집상태 = 모집중`인 프로그램만 내려준다 (날짜순)
- `POST /api/apply` — 신청 처리
  1. 전화번호(숫자만) 또는 이메일(소문자)이 일치하는 **기존 멤버를 찾는다**
  2. 있으면 재사용 + 연락처를 최신값으로 갱신. 없으면 멤버 생성
     - `유입경로`는 비어 있을 때만 채운다 (최초 유입 경로 보존)
  3. 같은 사람이 같은 프로그램에 이미 신청했으면 409로 거절
  4. `신청번호`를 `APP-{연도}-{순번}`으로 채번해 신청 레코드 생성
     (`신청상태 = 접수`, `입금상태 = 미입금`)

## 알려진 제약

- **채번 경쟁 조건**: 동시 제출이 몰리면 같은 `신청번호`가 나올 수 있다.
  워크숍 규모에선 문제되지 않지만, 대량 트래픽이면 Airtable Autonumber 필드로
  바꾸는 게 안전하다.
- **중복 신청 검사**가 신청 레코드 200건까지만 훑는다. 그 이상 쌓이면
  `filterByFormula`로 좁히도록 고쳐야 한다.
- 로컬 전용이다. 외부에 공개하려면 배포 + 스팸 방어(rate limit, captcha)가 필요하다.
