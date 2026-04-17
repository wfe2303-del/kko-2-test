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
