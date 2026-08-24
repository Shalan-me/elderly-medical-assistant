import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

import {
  MedicationManager,
  type Medication,
  type MedicationLog,
  type MedicationSchedule,
  type MedicationSuggestion,
  type SourceRecord,
} from './medication-manager'

function buildMedicationSuggestions(
  records: {
    id: string
    file_name: string
    extracted_data: unknown
  }[],
) {
  return records.flatMap((record) => {
    if (
      !record.extracted_data ||
      typeof record.extracted_data !== 'object' ||
      !('medications' in record.extracted_data) ||
      !Array.isArray(record.extracted_data.medications)
    ) {
      return []
    }

    return record.extracted_data.medications.flatMap((medication, index) => {
      if (
        !medication ||
        typeof medication !== 'object' ||
        !('name' in medication) ||
        typeof medication.name !== 'string' ||
        !medication.name.trim()
      ) {
        return []
      }

      return [{
        id: `${record.id}-${index}`,
        name: medication.name,
        dosage:
          'dosage' in medication && typeof medication.dosage === 'string'
            ? medication.dosage
            : '',
        frequency:
          'frequency' in medication && typeof medication.frequency === 'string'
            ? medication.frequency
            : '',
        instructions:
          'instructions' in medication &&
          typeof medication.instructions === 'string'
            ? medication.instructions
            : null,
        source_record_id: record.id,
        source_file_name: record.file_name,
      } satisfies MedicationSuggestion]
    })
  })
}

export default async function MedicationsPage() {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) redirect('/login')

  const [
    medicationsResult,
    schedulesResult,
    logsResult,
    recordsResult,
    suggestionsResult,
  ] =
    await Promise.all([
      supabase.from('medications').select('*').order('name'),
      supabase
        .from('medication_schedule')
        .select('id, medication_id, scheduled_time')
        .order('scheduled_time'),
      supabase
        .from('medication_logs')
        .select('id, medication_id, schedule_id, scheduled_date, status, taken_at'),
      supabase
        .from('medical_records')
        .select('id, file_name, document_date')
        .order('created_at', { ascending: false }),
      supabase
        .from('medical_records')
        .select('id, file_name, extracted_data')
        .eq('processing_status', 'completed')
        .not('extracted_data', 'is', null)
        .order('created_at', { ascending: false }),
    ])

  const loadError =
    medicationsResult.error || schedulesResult.error || logsResult.error
      ? 'We could not load your medication schedule right now. Please try again in a moment.'
      : ''

  return (
    <MedicationManager
      initialMedications={(medicationsResult.data ?? []) as Medication[]}
      initialSchedules={(schedulesResult.data ?? []) as MedicationSchedule[]}
      initialLogs={(logsResult.data ?? []) as MedicationLog[]}
      sourceRecords={(recordsResult.data ?? []) as SourceRecord[]}
      medicationSuggestions={buildMedicationSuggestions(
        suggestionsResult.data ?? [],
      )}
      initialError={loadError}
    />
  )
}
