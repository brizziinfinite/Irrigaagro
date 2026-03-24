create extension if not exists pgcrypto;

create table if not exists public.cron_job_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  trigger_date date not null,
  trigger_source text not null default 'vercel_cron',
  request_id text,
  status text not null default 'running' check (status in ('running', 'success', 'partial_failure', 'failed')),
  processed_count integer not null default 0,
  ok_count integer not null default 0,
  skipped_count integer not null default 0,
  error_count integer not null default 0,
  started_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  duration_ms integer,
  message text,
  error_message text,
  metadata jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists cron_job_runs_job_name_started_at_idx
  on public.cron_job_runs (job_name, started_at desc);

create index if not exists cron_job_runs_status_started_at_idx
  on public.cron_job_runs (status, started_at desc);

create table if not exists public.cron_job_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.cron_job_runs(id) on delete cascade,
  job_name text not null,
  event_type text not null check (event_type in ('run_note', 'season_processed', 'season_skipped', 'season_error')),
  season_id uuid,
  season_name text,
  farm_id uuid,
  pivot_id uuid,
  status text not null,
  message text not null,
  climate_source text,
  eto_source text,
  rainfall_source text,
  context jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists cron_job_events_run_id_created_at_idx
  on public.cron_job_events (run_id, created_at asc);

create index if not exists cron_job_events_job_name_event_type_idx
  on public.cron_job_events (job_name, event_type, created_at desc);

create or replace function public.set_cron_job_runs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_cron_job_runs_updated_at on public.cron_job_runs;

create trigger set_cron_job_runs_updated_at
before update on public.cron_job_runs
for each row
execute function public.set_cron_job_runs_updated_at();
