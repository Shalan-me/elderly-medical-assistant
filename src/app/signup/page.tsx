import { redirect } from 'next/navigation'
import { AuthForm } from '@/app/auth/auth-form'
import { createClient } from '@/lib/supabase/server'

export default async function SignupPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (data.user) redirect('/dashboard')
  return <AuthForm mode="signup" />
}
