import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { logout } from './actions'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) redirect('/login')

  return (
    <main className="dashboard-page">
      <section className="dashboard-card" aria-labelledby="dashboard-heading">
        <p className="eyebrow">Elderly Medical Assistant</p>
        <h1 id="dashboard-heading">Welcome</h1>
        <p>You are logged in as:</p>
        <p className="user-email">{data.user.email}</p>
        <p>This is your dashboard. More features will be added here soon.</p>
        <Link className="primary-button action-link" href="/records">
          View medical records
        </Link>
        <Link className="secondary-button action-link" href="/overview">
          View medical overview
        </Link>
        <Link className="secondary-button action-link" href="/medications">
          Medical Schedule
        </Link>
        <Link className="secondary-button action-link" href="/chat">
          Ask about my records
        </Link>
        <form action={logout}>
          <button className="secondary-button" type="submit">Log out</button>
        </form>
      </section>
    </main>
  )
}
