import type { SupabaseClient } from '@supabase/supabase-js'

export type TakenMedicationLog = {
  id: string
  medication_id: string
  schedule_id: string
  scheduled_date: string
  status: 'taken'
  taken_at: string
}

export async function saveTakenMedicationDose(
  supabase: SupabaseClient,
  {
    medicationId,
    scheduleId,
    scheduledDate,
  }: {
    medicationId: string
    scheduleId: string
    scheduledDate: string
  },
) {
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) {
    throw new Error('Your session has expired. Please log in again.')
  }

  const takenAt = new Date().toISOString()
  const { data, error } = await supabase
    .from('medication_logs')
    .upsert(
      {
        user_id: userData.user.id,
        medication_id: medicationId,
        schedule_id: scheduleId,
        scheduled_date: scheduledDate,
        status: 'taken',
        taken_at: takenAt,
      },
      { onConflict: 'schedule_id,scheduled_date' },
    )
    .select('id, medication_id, schedule_id, scheduled_date, status, taken_at')
    .single()

  if (error) throw error
  return data as TakenMedicationLog
}
