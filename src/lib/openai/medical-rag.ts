import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import {
  OPENAI_EMBEDDING_DIMENSIONS,
  OPENAI_EMBEDDING_MODEL,
  openai,
} from './client'
import type { ExtractedMedicalRecord } from './medical-processing'

type IndexableRecord = {
  id: string
  file_name: string
  document_type: string
  document_date: string | null
}

const MAX_CHUNK_CHARACTERS = 2400
const VITAL_SIGN_PATTERN =
  /\b(?:blood pressure|bp|systolic|diastolic|heart rate|pulse|temperature|respiratory rate|oxygen saturation|spo2|weight|height)\b|\b\d{2,3}\s*\/\s*\d{2,3}(?:\s*mmhg)?\b/i

function recordPrefix(record: IndexableRecord) {
  return [
    `Source record: ${record.file_name}`,
    `Document type: ${record.document_type}`,
    `Report date: ${record.document_date ?? 'not documented'}`,
  ].join('\n')
}

function groupLines(prefix: string, heading: string, lines: string[]) {
  const chunks: string[] = []
  let current = `${prefix}\n${heading}:`

  for (const line of lines) {
    const next = `${current}\n- ${line}`
    if (next.length > MAX_CHUNK_CHARACTERS && current !== `${prefix}\n${heading}:`) {
      chunks.push(current)
      current = `${prefix}\n${heading}:\n- ${line}`
    } else {
      current = next
    }
  }

  if (lines.length > 0) chunks.push(current)
  return chunks
}

export function createMedicalRecordChunks(
  record: IndexableRecord,
  extracted: ExtractedMedicalRecord,
) {
  const prefix = recordPrefix(record)
  const chronologicalEvents = [...extracted.important_medical_events].sort(
    (left, right) => {
      if (left.date && right.date) return left.date.localeCompare(right.date)
      if (left.date) return -1
      if (right.date) return 1
      return 0
    },
  )
  const vitalSignLines = Array.from(
    new Set(
      [
        extracted.short_summary,
        ...chronologicalEvents.map(
          ({ date, event }) => `${date ?? 'Date not documented'}: ${event}`,
        ),
      ].filter((line) => VITAL_SIGN_PATTERN.test(line)),
    ),
  )
  const chunks = [
    `${prefix}\nRecord summary: ${extracted.short_summary}`,
    ...groupLines(prefix, 'Documented vital signs', vitalSignLines),
    ...groupLines(prefix, 'Documented conditions', extracted.conditions),
    ...groupLines(
      prefix,
      'Documented medications',
      extracted.medications.map((medication) =>
        [
          medication.name,
          medication.dosage && `dosage: ${medication.dosage}`,
          medication.frequency && `frequency: ${medication.frequency}`,
          medication.instructions && `instructions: ${medication.instructions}`,
        ]
          .filter(Boolean)
          .join('; '),
      ),
    ),
    ...groupLines(prefix, 'Documented allergies', extracted.allergies),
    ...groupLines(prefix, 'Documented procedures', extracted.procedures),
    ...groupLines(
      prefix,
      'Important medical events',
      chronologicalEvents.map(
        ({ date, event }) => `${date ?? 'Date not documented'}: ${event}`,
      ),
    ),
  ]

  return chunks.filter((chunk) => chunk.trim().length > 0)
}

export async function createEmbedding(input: string | string[]) {
  const response = await openai.embeddings.create({
    model: OPENAI_EMBEDDING_MODEL,
    input,
    dimensions: OPENAI_EMBEDDING_DIMENSIONS,
    encoding_format: 'float',
  })

  return response.data.sort((a, b) => a.index - b.index).map((item) => item.embedding)
}

export async function indexMedicalRecord({
  supabase,
  userId,
  record,
  extracted,
}: {
  supabase: SupabaseClient
  userId: string
  record: IndexableRecord
  extracted: ExtractedMedicalRecord
}) {
  const chunks = createMedicalRecordChunks(record, extracted)
  const embeddings = await createEmbedding(chunks)

  if (embeddings.length !== chunks.length) {
    throw new Error('OpenAI did not return an embedding for every record section.')
  }

  const { error: deleteError } = await supabase
    .from('document_chunks')
    .delete()
    .eq('record_id', record.id)
  if (deleteError) throw deleteError

  const { error: insertError } = await supabase.from('document_chunks').insert(
    chunks.map((content, index) => ({
      user_id: userId,
      record_id: record.id,
      content,
      embedding: embeddings[index],
    })),
  )
  if (insertError) throw insertError
}
