create extension if not exists pgcrypto;

create table if not exists public.medical_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  document_type text not null,
  document_date date,
  created_at timestamptz not null default now()
);

create index if not exists medical_records_user_created_at_idx
  on public.medical_records (user_id, created_at desc);

alter table public.medical_records enable row level security;

create policy "Users can read their own medical records"
  on public.medical_records
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert their own medical records"
  on public.medical_records
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own medical records"
  on public.medical_records
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'medical-records',
  'medical-records',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Users can read their own medical record files"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'medical-records'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users can upload their own medical record files"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'medical-records'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users can delete their own medical record files"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'medical-records'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
