-- 기존 DB에 제한 시간 기능 추가 (SQL Editor에서 실행)
alter table public.game add column if not exists time_limit int not null default 30;
alter table public.game add column if not exists question_started_at timestamptz;

update public.game set time_limit = 30 where time_limit is null;
