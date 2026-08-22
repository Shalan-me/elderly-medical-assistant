import { redirect } from 'next/navigation'
import { AuthForm } from '@/app/auth/auth-form'
import { createClient } from '@/lib/supabase/server'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const supabase = await createClient()
  const [{ data }, params] = await Promise.all([
    supabase.auth.getUser(),
    searchParams,
  ])
  if (data.user) redirect('/dashboard')
  return (
    <AuthForm
      mode="login"
      initialError={
        params.error === 'confirmation_failed'
          ? 'We could not confirm your email. Please request a new confirmation link or try again.'
          : ''
      }
    />
  )
}
