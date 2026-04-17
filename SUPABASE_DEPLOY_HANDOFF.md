# Supabase Deploy Handoff

## 현재 상태

이 프로젝트는 `Vercel + Supabase + Google Sheets API` 기준으로 정리되어 있습니다.

- Apps Script 의존 경로 제거
- 저장 데이터는 Supabase 사용
- 수강생 명단 조회와 M열 반영은 Google Sheets API 사용
- 로그인은 앱 전용 ID/PW 세션 방식 유지

## 내가 이미 해둔 것

- Supabase 저장 로직 연결
- Google Sheets 서비스 계정 연결 로직 연결
- Vercel 환경변수 기준으로 동작하도록 정리
- SQL 스키마 파일 추가
- handoff용 압축본 생성

압축본:

- [kakaocheck-supabase-ready.zip](C:/Users/user/Downloads/kakaocheck_3.0-main/kakaocheck-supabase-ready.zip:1)

SQL 파일:

- [supabase/schema.sql](C:/Users/user/Downloads/kakaocheck_3.0-main/supabase/schema.sql:1)

환경변수 예시:

- [.env.example](C:/Users/user/Downloads/kakaocheck_3.0-main/.env.example:1)

## 네가 해야 하는 일

### 1. GitHub

이 세션에서는 새 GitHub repo를 직접 생성할 도구가 없습니다.

해야 할 일:

1. GitHub에서 빈 repo 하나 생성
2. repo 이름을 정함
3. 그 `owner/repo`를 나에게 알려줌

그러면 그 다음 단계에서 repo 안에 올릴 파일 기준으로 다시 정리해줄 수 있습니다.

만약 바로 수동 업로드할 거면 이 폴더 전체를 쓰면 되고, 압축본은 참고용입니다.

### 2. Supabase

1. Supabase 무료 프로젝트 생성
2. SQL Editor 열기
3. [supabase/schema.sql](C:/Users/user/Downloads/kakaocheck_3.0-main/supabase/schema.sql:1) 전체 실행
4. `Project Settings -> API`에서 아래 확인
   - `Project URL`
   - `service_role` key

주의:

- `anon` 키가 아니라 `service_role` 키를 사용해야 합니다.
- `service_role`은 브라우저 코드에 넣으면 안 됩니다. Vercel 환경변수에만 넣어야 합니다.

### 3. Google Cloud

1. Google Cloud 프로젝트 생성
2. `Google Sheets API` 활성화
3. 서비스 계정 생성
4. JSON 키 발급
5. 실제 출석 대상 스프레드시트를 그 서비스 계정 이메일에 공유

### 4. Vercel

아래 환경변수를 `Production`, `Preview`, `Development`에 모두 넣는 걸 권장합니다.

```txt
KAKAO_CHECK_SPREADSHEET_ID=실제_출석_대상_스프레드시트_ID
KAKAO_CHECK_ALLOWED_ORIGINS=https://your-project.vercel.app,https://*.vercel.app
KAKAO_CHECK_SESSION_SECRET=긴_랜덤_문자열
KAKAO_CHECK_USERS_JSON=[{"username":"manager","password":"change-me","displayName":"Manager","allowedSheets":["*"],"canWrite":true}]
KAKAO_CHECK_GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
KAKAO_CHECK_SUPABASE_URL=https://your-project-ref.supabase.co
KAKAO_CHECK_SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

서비스 계정 JSON이 너무 길면 아래 변수로 base64를 넣어도 됩니다.

```txt
KAKAO_CHECK_GOOGLE_SERVICE_ACCOUNT_JSON_B64=base64_encoded_json_here
```

### 5. 배포 후 확인

1. 로그인 되는지 확인
2. 시트 목록이 보이는지 확인
3. 로그 파일 업로드 후 실행 확인
4. 서버 저장 데이터 보기가 열리는지 확인
5. 미매칭 수동처리 저장이 되는지 확인

## 복붙용 SQL

```sql
create table if not exists public.kakao_sheet_states (
  sheet_title text primary key,
  snapshot jsonb,
  last_saved_at timestamptz,
  last_snapshot_at timestamptz,
  open_count integer not null default 0,
  manual_rule_count integer not null default 0,
  joined_count integer not null default 0,
  left_count integer not null default 0,
  attending_count integer not null default 0,
  final_left_count integer not null default 0,
  missing_count integer not null default 0,
  current_unmatched_count integer not null default 0,
  resolved_pending_count integer not null default 0,
  manual_resolved_count integer not null default 0,
  excluded_by_rule_count integer not null default 0
);

create table if not exists public.kakao_queue_items (
  queue_key text primary key,
  sheet_title text not null,
  status text not null,
  category text not null,
  name text not null,
  name_normalized text not null,
  phone4 text not null default '',
  label text not null,
  reason text not null default '',
  attempt_count integer not null default 0,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  opened_at timestamptz,
  resolved_at timestamptz,
  resolution_type text not null default '',
  resolution_label text not null default '',
  resolution_target_row integer not null default 0,
  resolution_target_name text not null default '',
  resolution_target_phone text not null default '',
  handled_by text not null default '',
  handled_at timestamptz,
  context jsonb not null default '{}'::jsonb
);

create index if not exists kakao_queue_items_sheet_title_idx
  on public.kakao_queue_items (sheet_title);

create index if not exists kakao_queue_items_sheet_status_idx
  on public.kakao_queue_items (sheet_title, status);
```

## 복붙용 환경변수 템플릿

```txt
KAKAO_CHECK_SPREADSHEET_ID=
KAKAO_CHECK_ALLOWED_ORIGINS=https://your-project.vercel.app,https://*.vercel.app
KAKAO_CHECK_SESSION_SECRET=
KAKAO_CHECK_USERS_JSON=
KAKAO_CHECK_GOOGLE_SERVICE_ACCOUNT_JSON=
KAKAO_CHECK_SUPABASE_URL=
KAKAO_CHECK_SUPABASE_SERVICE_ROLE_KEY=
```
