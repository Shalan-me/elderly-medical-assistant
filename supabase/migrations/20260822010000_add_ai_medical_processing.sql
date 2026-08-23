alter table public.medical_records
  alter column document_type drop not null,
  add column if not exists processing_status text,
  add column if not exists extracted_data jsonb,
  add column if not exists processing_error text,
  add column if not exists processed_at timestamptz;

update public.medical_records
set
  processing_status = 'failed',
  processing_error = 'This record was uploaded before AI processing was enabled.'
where processing_status is null;

alter table public.medical_records
  alter column processing_status set default 'processing',
  alter column processing_status set not null;

alter table public.medical_records
  drop constraint if exists medical_records_processing_status_check;

alter table public.medical_records
  add constraint medical_records_processing_status_check
  check (processing_status in ('processing', 'completed', 'failed'));

create policy "Users can update their own medical records"
  on public.medical_records
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table if not exists public.medical_overviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  overview jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.medical_overviews enable row level security;

create policy "Users can read their own medical overview"
  on public.medical_overviews
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert their own medical overview"
  on public.medical_overviews
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own medical overview"
  on public.medical_overviews
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
