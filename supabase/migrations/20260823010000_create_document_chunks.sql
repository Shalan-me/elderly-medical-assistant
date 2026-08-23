create extension if not exists vector with schema extensions;

create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  record_id uuid not null references public.medical_records(id) on delete cascade,
  content text not null check (length(btrim(content)) > 0),
  embedding extensions.vector(1536) not null,
  created_at timestamptz not null default now()
);

create index document_chunks_user_id_idx
  on public.document_chunks (user_id);

create index document_chunks_record_id_idx
  on public.document_chunks (record_id);

alter table public.document_chunks enable row level security;

create policy "Users can read their own document chunks"
  on public.document_chunks
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert their own document chunks"
  on public.document_chunks
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.medical_records
      where medical_records.id = record_id
        and medical_records.user_id = (select auth.uid())
    )
  );

create policy "Users can update their own document chunks"
  on public.document_chunks
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.medical_records
      where medical_records.id = record_id
        and medical_records.user_id = (select auth.uid())
    )
  );

create policy "Users can delete their own document chunks"
  on public.document_chunks
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.match_document_chunks(
  query_embedding extensions.vector(1536),
  match_threshold double precision default 0.35,
  match_count integer default 6
)
returns table (
  id uuid,
  record_id uuid,
  content text,
  source_file_name text,
  similarity double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    document_chunks.id,
    document_chunks.record_id,
    document_chunks.content,
    medical_records.file_name as source_file_name,
    1 - (
      document_chunks.embedding
      operator(extensions.<=>)
      query_embedding
    ) as similarity
  from public.document_chunks
  join public.medical_records
    on medical_records.id = document_chunks.record_id
  where document_chunks.user_id = (select auth.uid())
    and medical_records.user_id = (select auth.uid())
    and document_chunks.embedding operator(extensions.<=>) query_embedding
      < 1 - match_threshold
  order by document_chunks.embedding operator(extensions.<=>) query_embedding
  limit least(greatest(match_count, 1), 10);
$$;

revoke all on function public.match_document_chunks(
  extensions.vector,
  double precision,
  integer
) from public;

grant execute on function public.match_document_chunks(
  extensions.vector,
  double precision,
  integer
) to authenticated;
