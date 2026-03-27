-- Tabela de programação de irrigação (separada do balanço real)
create table if not exists irrigation_schedule (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  pivot_id      uuid not null references pivots(id) on delete cascade,
  season_id     uuid not null references seasons(id) on delete cascade,
  date          date not null,
  lamina_mm     numeric(8,2),
  speed_percent numeric(5,2),
  start_time    time,
  end_time      time,
  rainfall_mm   numeric(8,2),
  status        text not null default 'planned'
                check (status in ('planned', 'done', 'cancelled')),
  cancelled_reason text
                check (cancelled_reason is null or cancelled_reason in ('chuva', 'quebra', 'outro')),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (pivot_id, date)
);

-- RLS
alter table irrigation_schedule enable row level security;

create policy "members can manage own company schedules"
  on irrigation_schedule
  for all
  using (
    company_id in (
      select company_id from company_members where user_id = auth.uid()
    )
  )
  with check (
    company_id in (
      select company_id from company_members where user_id = auth.uid()
    )
  );

-- Índices
create index on irrigation_schedule (company_id, date);
create index on irrigation_schedule (pivot_id, date);
create index on irrigation_schedule (season_id);
