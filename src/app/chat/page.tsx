import Link from 'next/link'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

import { ChatInterface } from './chat-interface'

export default async function ChatPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect('/login')

  return (
    <main className="records-page">
      <div className="records-shell chat-shell">
        <header className="records-header">
          <div>
            <p className="eyebrow">Your medical records</p>
            <h1>Ask about my records</h1>
          </div>
          <Link className="text-link" href="/dashboard">
            Back to dashboard
          </Link>
        </header>

        <p className="form-alert overview-notice chat-notice">
          Answers use only your uploaded records. This tool does not provide new
          diagnoses or treatment advice. For medical decisions, speak with a
          qualified healthcare professional.
        </p>

        <ChatInterface />
      </div>
    </main>
  )
}
