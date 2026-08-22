import { redirect } from 'next/navigation'
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
        <form action={logout}>
          <button className="secondary-button" type="submit">Log out</button>
        </form>
      </section>
    </main>
  )
}
