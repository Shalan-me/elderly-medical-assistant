import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

import {
  MedicationManager,
  type Medication,
  type MedicationLog,
  type MedicationSchedule,
  type SourceRecord,
} from './medication-manager'

export default async function MedicationsPage() {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) redirect('/login')

  const [medicationsResult, schedulesResult, logsResult, recordsResult] =
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
    ])

  const loadError =
    medicationsResult.error || schedulesResult.error || logsResult.error
      ? 'We could not load your medication schedule. Confirm that the medication migration has been applied.'
      : ''

  return (
    <MedicationManager
      initialMedications={(medicationsResult.data ?? []) as Medication[]}
      initialSchedules={(schedulesResult.data ?? []) as MedicationSchedule[]}
      initialLogs={(logsResult.data ?? []) as MedicationLog[]}
      sourceRecords={(recordsResult.data ?? []) as SourceRecord[]}
      initialError={loadError}
    />
  )
}
