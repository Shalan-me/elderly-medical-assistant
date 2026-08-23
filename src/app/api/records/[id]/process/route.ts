import { NextResponse } from 'next/server'

import {
  extractMedicalRecord,
  regenerateMedicalOverview,
} from '@/lib/openai/medical-processing'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 120

function contentTypeFor(fileName: string, downloadedType: string) {
  if (downloadedType && downloadedType !== 'application/octet-stream') return downloadedType
  const extension = fileName.split('.').pop()?.toLowerCase()
  if (extension === 'pdf') return 'application/pdf'
  if (extension === 'png') return 'image/png'
  if (extension === 'webp') return 'image/webp'
  return 'image/jpeg'
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { data: record, error: recordError } = await supabase
    .from('medical_records')
    .select('id, file_name, storage_path, document_type, document_date')
    .eq('id', id)
    .single()

  if (recordError || !record) {
    return NextResponse.json({ error: 'Medical record not found.' }, { status: 404 })
  }

  await supabase
    .from('medical_records')
    .update({ processing_status: 'processing', processing_error: null })
    .eq('id', id)

  try {
    const { data: file, error: downloadError } = await supabase.storage
      .from('medical-records')
      .download(record.storage_path)
    if (downloadError) throw downloadError

    const extracted = await extractMedicalRecord({
      bytes: await file.arrayBuffer(),
      contentType: contentTypeFor(record.file_name, file.type),
      fileName: record.file_name,
      selectedDocumentType:
        record.document_type && record.document_type !== 'Not sure'
          ? record.document_type
          : null,
    })

    const { data: updatedRecord, error: updateError } = await supabase
      .from('medical_records')
      .update({
        document_type:
          record.document_type && record.document_type !== 'Not sure'
            ? record.document_type
            : extracted.document_type,
        document_date: record.document_date ?? extracted.document_date,
        extracted_data: extracted,
        processing_status: 'completed',
        processing_error: null,
        processed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id, file_name, storage_path, document_type, document_date, created_at, processing_status, processing_error')
      .single()
    if (updateError) throw updateError

    let overviewWarning: string | null = null
    try {
      await regenerateMedicalOverview(supabase, userData.user.id)
    } catch {
      overviewWarning = 'The record was processed, but the medical overview could not be refreshed.'
    }

    return NextResponse.json({ record: updatedRecord, overviewWarning })
  } catch (processingError) {
    const message = processingError instanceof Error
      ? processingError.message
      : 'The record could not be processed.'

    await supabase
      .from('medical_records')
      .update({ processing_status: 'failed', processing_error: message })
      .eq('id', id)

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
