import Link from 'next/link'
import { redirect } from 'next/navigation'

import type { MedicalOverview } from '@/lib/openai/medical-processing'
import { createClient } from '@/lib/supabase/server'

function TextList({ items }: { items: string[] }) {
  return items.length ? <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p>None found in uploaded records.</p>
}

function formatFriendlyDate(value: string) {
  if (/^\d{4}$/.test(value)) return value

  const yearAndMonth = /^(\d{4})-(\d{2})$/.exec(value)
  if (yearAndMonth) {
    const [, year, month] = yearAndMonth
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, 1))
    return new Intl.DateTimeFormat(undefined, {
      month: 'long',
      timeZone: 'UTC',
      year: 'numeric',
    }).format(date)
  }

  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
  const date = isDateOnly ? new Date(`${value}T00:00:00Z`) : new Date(value)

  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: 'long',
        timeZone: isDateOnly ? 'UTC' : undefined,
      }).format(date)
}

export default async function OverviewPage() {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) redirect('/login')

  const [overviewResult, latestRecordResult] = await Promise.all([
    supabase
      .from('medical_overviews')
      .select('overview, updated_at')
      .maybeSingle(),
    supabase
      .from('medical_records')
      .select('id, file_name, document_type, document_date, processed_at')
      .eq('processing_status', 'completed')
      .order('processed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const overview = overviewResult.data?.overview as MedicalOverview | undefined
  const latestRecord = latestRecordResult.data

  return (
    <main className="records-page">
      <div className="records-shell">
        <header className="records-header">
          <div>
            <p className="eyebrow">Elderly Medical Assistant</p>
            <h1>Medical overview</h1>
          </div>
          <Link className="text-link" href="/dashboard">Back to dashboard</Link>
        </header>

        <p className="form-alert overview-notice" role="note">
          This overview is based only on your uploaded records. It is not a diagnosis or treatment recommendation. Always confirm medical information with a qualified healthcare professional.
        </p>

        {overviewResult.error ? (
          <section className="records-card" role="alert">
            <h2>We could not load your overview</h2>
            <p>Please try opening this page again in a moment.</p>
          </section>
        ) : !overview ? (
          <section className="records-card">
            <h2>No overview yet</h2>
            <p>Upload a medical record and wait for processing to finish.</p>
            <Link className="primary-button action-link" href="/records">Go to medical records</Link>
          </section>
        ) : (
          <div className="overview-grid">
            <section className="records-card overview-summary overview-wide">
              <h2>Summary</h2>
              <div className="overview-summary-text">
                {overview.summary.split(/\n+/).filter(Boolean).map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
              <p className="overview-timestamp">Overview updated {new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeStyle: 'short' }).format(new Date(overviewResult.data!.updated_at))}</p>
            </section>

            {latestRecord && (
              <section className="records-card latest-update overview-wide">
                <p className="eyebrow">Latest update</p>
                <h2>{latestRecord.file_name}</h2>
                <p>{latestRecord.document_type || 'Medical record'}</p>
                <p>
                  Report date: {latestRecord.document_date
                    ? formatFriendlyDate(latestRecord.document_date)
                    : 'Not documented'}
                </p>
                <p className="field-help">
                  Added to your history {formatFriendlyDate(latestRecord.processed_at)}
                </p>
                <a className="text-link" href={`/records/${latestRecord.id}`} target="_blank" rel="noopener noreferrer">
                  View source record
                </a>
              </section>
            )}

            <section className="records-card overview-wide"><h2>Your medications</h2>
              {overview.medications.length ? <ul>{overview.medications.map((item, index) => <li key={`${item.name}-${index}`}><strong>{item.name}</strong> — {item.dosage || 'Dosage not listed'}, {item.frequency || 'frequency not listed'}</li>)}</ul> : <p>None found in uploaded records.</p>}
            </section>
            <section className="records-card"><h2>Your conditions</h2><TextList items={overview.conditions} /></section>
            <section className="records-card"><h2>Your allergies</h2><TextList items={overview.allergies} /></section>
            <section className="records-card overview-wide"><h2>Previous procedures</h2><TextList items={overview.procedures} /></section>
            <section className="records-card overview-wide"><h2>Important medical events</h2>
              {overview.important_medical_events.length ? <ul>{overview.important_medical_events.map((item, index) => <li key={`${item.date}-${index}`}><strong>{item.date ? formatFriendlyDate(item.date) : 'Date not documented'}:</strong> {item.event}</li>)}</ul> : <p>None found in uploaded records.</p>}
            </section>
          </div>
        )}
      </div>
    </main>
  )
}
