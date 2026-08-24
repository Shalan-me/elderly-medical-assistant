import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

import { RecordsManager, type MedicalRecord } from './records-manager'

export default async function RecordsPage() {
  const supabase = await createClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) redirect('/login')

  const { data, error } = await supabase
    .from('medical_records')
    .select('id, file_name, storage_path, document_type, document_date, created_at, processing_status, processing_error')
    .order('created_at', { ascending: false })

  if (error) {
    return (
      <RecordsManager
        records={[]}
        initialError="We could not load your medical records right now. Please try again in a moment."
      />
    )
  }

  return <RecordsManager records={(data ?? []) as MedicalRecord[]} />
}
