create or replace function public.match_timeline_document_chunks(
  query_embedding extensions.vector(1536),
  match_threshold double precision default 0.35,
  match_count integer default 24,
  chunks_per_record integer default 3
)
returns table (
  id uuid,
  record_id uuid,
  content text,
  source_file_name text,
  document_date date,
  similarity double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  with ranked_chunks as (
    select
      document_chunks.id,
      document_chunks.record_id,
      document_chunks.content,
      medical_records.file_name as source_file_name,
      medical_records.document_date,
      1 - (
        document_chunks.embedding
        operator(extensions.<=>)
        query_embedding
      ) as similarity,
      row_number() over (
        partition by document_chunks.record_id
        order by document_chunks.embedding operator(extensions.<=>) query_embedding
      ) as record_rank
    from public.document_chunks
    join public.medical_records
      on medical_records.id = document_chunks.record_id
    where document_chunks.user_id = (select auth.uid())
      and medical_records.user_id = (select auth.uid())
      and document_chunks.embedding operator(extensions.<=>) query_embedding
        < 1 - match_threshold
  )
  select
    ranked_chunks.id,
    ranked_chunks.record_id,
    ranked_chunks.content,
    ranked_chunks.source_file_name,
    ranked_chunks.document_date,
    ranked_chunks.similarity
  from ranked_chunks
  where ranked_chunks.record_rank <= least(greatest(chunks_per_record, 1), 5)
  order by ranked_chunks.similarity desc
  limit least(greatest(match_count, 1), 40);
$$;

revoke all on function public.match_timeline_document_chunks(
  extensions.vector,
  double precision,
  integer,
  integer
) from public;

grant execute on function public.match_timeline_document_chunks(
  extensions.vector,
  double precision,
  integer,
  integer
) to authenticated;
