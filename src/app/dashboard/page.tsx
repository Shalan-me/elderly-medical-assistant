import Link from 'next/link'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

import { logout } from './actions'
import {
  TodaysMedicationsCard,
  type DashboardMedication,
  type DashboardSchedule,
} from './todays-medications-card'
import type { TakenMedicationLog } from '@/lib/supabase/medication-logs'

function formatDate(value: string) {
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
  const date = isDateOnly ? new Date(`${value}T00:00:00Z`) : new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Date not documented'
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: 'long',
        timeZone: isDateOnly ? 'UTC' : undefined,
      }).format(date)
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) redirect('/login')

  const [medications, schedules, logs, overview, records, latestRecord] = await Promise.all([
    supabase
      .from('medications')
      .select('id, name, dosage, start_date, end_date, active')
      .eq('active', true),
    supabase
      .from('medication_schedule')
      .select('id, medication_id, scheduled_time')
      .order('scheduled_time'),
    supabase
      .from('medication_logs')
      .select('id, medication_id, schedule_id, scheduled_date, status, taken_at'),
    supabase.from('medical_overviews').select('updated_at').maybeSingle(),
    supabase
      .from('medical_records')
      .select('id', { count: 'exact', head: true }),
    supabase
      .from('medical_records')
      .select('id, file_name, document_type, document_date, processed_at')
      .eq('processing_status', 'completed')
      .order('processed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  return (
    <main className="dashboard-page">
      <div className="dashboard-shell">
        <header className="dashboard-welcome">
          <div>
            <p className="eyebrow">Elderly Medical Assistant</p>
            <h1>Welcome home</h1>
            <p className="dashboard-intro">
              Your medical information and daily schedule are all in one place.
            </p>
            <p className="user-email">Signed in as {data.user.email}</p>
          </div>
          <form action={logout}>
            <button className="secondary-button dashboard-logout" type="submit">
              Log out
            </button>
          </form>
        </header>

        <section className="dashboard-grid" aria-label="Your medical home">
          <TodaysMedicationsCard
            medications={(medications.data ?? []) as DashboardMedication[]}
            schedules={(schedules.data ?? []) as DashboardSchedule[]}
            initialLogs={(logs.data ?? []) as TakenMedicationLog[]}
            loadError={Boolean(medications.error || schedules.error || logs.error)}
          />

          <article className="home-card">
            <p className="home-card-kicker">At a glance</p>
            <h2>Medical overview</h2>
            <p>
              {overview.error
                ? 'Your overview is unavailable right now.'
                : overview.data
                  ? `Last updated ${formatDate(overview.data.updated_at)}.`
                  : 'No overview yet. Upload a record to create one.'}
            </p>
            <Link className="secondary-button action-link" href="/overview">
              View medical overview
            </Link>
          </article>

          <article className="home-card">
            <p className="home-card-kicker">Your files</p>
            <h2>Medical records</h2>
            <p>
              {records.error
                ? 'Your record count is unavailable right now.'
                : records.count
                  ? `${records.count} uploaded ${records.count === 1 ? 'record' : 'records'}.`
                  : 'No medical records have been uploaded yet.'}
            </p>
            <Link className="secondary-button action-link" href="/records">
              View or upload records
            </Link>
          </article>

          <article className="home-card">
            <p className="home-card-kicker">Questions</p>
            <h2>Ask about my records</h2>
            <p>Get a simple answer using information from your uploaded records.</p>
            <Link className="secondary-button action-link" href="/chat">
              Ask a question
            </Link>
          </article>

          <article className="home-card home-card-wide latest-home-card">
            <p className="home-card-kicker">Latest medical update</p>
            {latestRecord.error ? (
              <>
                <h2>Update unavailable</h2>
                <p>We could not load your latest update right now.</p>
              </>
            ) : latestRecord.data ? (
              <>
                <h2>{latestRecord.data.file_name}</h2>
                <p>
                  {latestRecord.data.document_type || 'Medical record'}
                  {' · '}
                  {latestRecord.data.document_date
                    ? formatDate(latestRecord.data.document_date)
                    : 'Report date not documented'}
                </p>
                <a
                  className="secondary-button action-link"
                  href={`/records/${latestRecord.data.id}`}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  View latest record
                </a>
              </>
            ) : (
              <>
                <h2>No processed records yet</h2>
                <p>Your latest update will appear here after a record is processed.</p>
                <Link className="secondary-button action-link" href="/records">
                  Add a medical record
                </Link>
              </>
            )}
          </article>
        </section>
      </div>
    </main>
  )
}
