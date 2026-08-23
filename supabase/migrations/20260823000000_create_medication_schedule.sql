create table public.medications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  dosage text not null check (length(trim(dosage)) > 0),
  frequency text not null check (length(trim(frequency)) > 0),
  instructions text,
  start_date date not null,
  end_date date,
  active boolean not null default true,
  source_record_id uuid references public.medical_records(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (end_date is null or end_date >= start_date)
);

create table public.medication_schedule (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  medication_id uuid not null,
  scheduled_time time not null,
  created_at timestamptz not null default now(),
  unique (medication_id, scheduled_time),
  unique (id, medication_id, user_id),
  foreign key (medication_id, user_id)
    references public.medications(id, user_id) on delete cascade
);

create table public.medication_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  medication_id uuid not null,
  schedule_id uuid not null,
  scheduled_date date not null,
  status text not null check (status in ('taken')),
  taken_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (schedule_id, scheduled_date),
  foreign key (schedule_id, medication_id, user_id)
    references public.medication_schedule(id, medication_id, user_id)
    on delete cascade
);

create index medications_user_active_idx
  on public.medications (user_id, active);
create index medication_schedule_user_time_idx
  on public.medication_schedule (user_id, scheduled_time);
create index medication_logs_user_date_idx
  on public.medication_logs (user_id, scheduled_date);

alter table public.medications enable row level security;
alter table public.medication_schedule enable row level security;
alter table public.medication_logs enable row level security;

create policy "Users can read their own medications"
  on public.medications for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert their own medications"
  on public.medications for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      source_record_id is null
      or exists (
        select 1 from public.medical_records
        where id = source_record_id and user_id = (select auth.uid())
      )
    )
  );

create policy "Users can update their own medications"
  on public.medications for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      source_record_id is null
      or exists (
        select 1 from public.medical_records
        where id = source_record_id and user_id = (select auth.uid())
      )
    )
  );

create policy "Users can delete their own medications"
  on public.medications for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can read their own medication schedules"
  on public.medication_schedule for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can insert their own medication schedules"
  on public.medication_schedule for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users can update their own medication schedules"
  on public.medication_schedule for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users can delete their own medication schedules"
  on public.medication_schedule for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can read their own medication logs"
  on public.medication_logs for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can insert their own medication logs"
  on public.medication_logs for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users can update their own medication logs"
  on public.medication_logs for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users can delete their own medication logs"
  on public.medication_logs for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.medications to authenticated;
grant select, insert, update, delete on public.medication_schedule to authenticated;
grant select, insert, update, delete on public.medication_logs to authenticated;
