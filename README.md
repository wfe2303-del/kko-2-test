# Kakao Check 3.0

입장 로그 TXT 파일을 읽어 수강생 입장 체크를 수행하는 웹앱입니다.

현재 권장 구조:

- 프론트와 서버 API: Vercel
- 시트 읽기/쓰기: Google Sheets API 직접 호출
- 미매칭, 수동처리, 저장 데이터: Supabase Postgres
- Apps Script: 사용하지 않음

## 빠른 시작

1. Supabase 프로젝트 생성
2. [supabase/schema.sql](C:/Users/user/Downloads/kakaocheck_3.0-main/supabase/schema.sql:1) 실행
3. Google 서비스 계정 생성 후 대상 스프레드시트 공유
4. Vercel 환경변수 설정
5. 재배포

자세한 handoff 문서는 [SUPABASE_DEPLOY_HANDOFF.md](C:/Users/user/Downloads/kakaocheck_3.0-main/SUPABASE_DEPLOY_HANDOFF.md:1)를 보면 됩니다.

## 환경변수

예시는 [.env.example](C:/Users/user/Downloads/kakaocheck_3.0-main/.env.example:1)에 있습니다.

- `KAKAO_CHECK_SPREADSHEET_ID`
- `KAKAO_CHECK_ALLOWED_ORIGINS`
- `KAKAO_CHECK_SESSION_SECRET`
- `KAKAO_CHECK_USERS_JSON`
- `KAKAO_CHECK_GOOGLE_SERVICE_ACCOUNT_FILE`
- `KAKAO_CHECK_GOOGLE_SERVICE_ACCOUNT_JSON`
- `KAKAO_CHECK_GOOGLE_SERVICE_ACCOUNT_JSON_B64`
- `KAKAO_CHECK_SUPABASE_URL`
- `KAKAO_CHECK_SUPABASE_SERVICE_ROLE_KEY`

## 로컬 실행

```bash
npm install
npm run start
```

## 저장 구조

Supabase에는 아래 두 테이블을 사용합니다.

- `kakao_sheet_states`
- `kakao_queue_items`

이 구조로 아래 기능을 유지합니다.

- 현재 미매칭 관리
- 수동 매칭 규칙 저장
- 코칭스태프 제외 규칙 저장
- 시트별 최신 실행 상태 저장
- 서버 저장 데이터 보기

## 참고

- `apps-script/` 폴더는 이전 방식의 흔적입니다. 현재 권장 구조에서는 사용하지 않습니다.
- `server.js`는 로컬 실행용으로 남아 있고, 운영 배포는 Vercel 기준입니다.
