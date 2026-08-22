'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'

import { createClient } from '@/lib/supabase/client'

type AuthMode = 'login' | 'signup'

export function AuthForm({
  mode,
  initialError = '',
}: {
  mode: AuthMode
  initialError?: string
}) {
  const router = useRouter()
  const [error, setError] = useState(initialError)
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isLogin = mode === 'login'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')
    setIsSubmitting(true)

    const form = event.currentTarget
    const formData = new FormData(form)
    const email = String(formData.get('email') ?? '').trim()
    const password = String(formData.get('password') ?? '')
    const supabase = createClient()

    try {
      if (isLogin) {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (authError) throw authError
        router.replace('/dashboard')
        router.refresh()
        return
      }

      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      })
      if (authError) throw authError

      if (data.session) {
        router.replace('/dashboard')
        router.refresh()
        return
      }

      setMessage('Account created. Please check your email and follow the confirmation link before logging in.')
      form.reset()
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-heading">
        <p className="eyebrow">Elderly Medical Assistant</p>
        <h1 id="auth-heading">{isLogin ? 'Log in' : 'Create your account'}</h1>
        <p className="auth-intro">
          {isLogin ? 'Enter your email and password to continue.' : 'Use an email address you can access. Your password must be at least 6 characters.'}
        </p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="field-group">
            <label htmlFor="email">Email address</label>
            <input id="email" name="email" type="email" inputMode="email" autoComplete="email" required disabled={isSubmitting} />
          </div>
          <div className="field-group">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" autoComplete={isLogin ? 'current-password' : 'new-password'} minLength={6} required disabled={isSubmitting} />
          </div>
          {error && <p className="form-alert error-alert" role="alert">{error}</p>}
          {message && <p className="form-alert success-alert" role="status">{message}</p>}
          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Please wait…' : isLogin ? 'Log in' : 'Create account'}
          </button>
        </form>
        <p className="auth-switch">
          {isLogin ? 'Need an account?' : 'Already have an account?'}{' '}
          <Link href={isLogin ? '/signup' : '/login'}>{isLogin ? 'Sign up' : 'Log in'}</Link>
        </p>
      </section>
    </main>
  )
}
