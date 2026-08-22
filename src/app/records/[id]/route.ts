import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return NextResponse.redirect(new URL('/login', request.url))

  const { id } = await params
  const { data: record } = await supabase
    .from('medical_records')
    .select('storage_path')
    .eq('id', id)
    .single()

  if (!record) return new NextResponse('Medical record not found.', { status: 404 })

  const { data, error } = await supabase.storage
    .from('medical-records')
    .createSignedUrl(record.storage_path, 60)

  if (error) return new NextResponse('Unable to open this medical record.', { status: 500 })
  return NextResponse.redirect(data.signedUrl)
}
