import Link from 'next/link'
import { redirect } from 'next/navigation'

import type { MedicalOverview } from '@/lib/openai/medical-processing'
import { createClient } from '@/lib/supabase/server'

function TextList({ items }: { items: string[] }) {
  return items.length ? <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p>None found in uploaded records.</p>
}

type OverviewEvent = MedicalOverview['important_medical_events'][number]

function isCarePlanOnly(event: string, date: string | null) {
  const text = event.trim()
  const containsHistoricalFact =
    /\b(?:diagnosed|documented|measured|underwent|performed|started|stopped|changed|increased|decreased|admitted|discharged)\b/i.test(text) ||
    /\b(?:visit|consultation) (?:occurred|documented|completed)\b/i.test(text) ||
    /\b\d{2,3}\s*\/\s*\d{2,3}\b/.test(text)

  if (containsHistoricalFact) return false

  if (
    !date &&
    /\b(?:follow[- ]?up|return|recheck|next appointment)\b/i.test(text)
  ) {
    return true
  }

  return (
    /\b(?:recommended|advised|instructed|care plan)\b/i.test(text) ||
    /^(?:continue|maintain|keep taking|return|recheck|schedule)\b/i.test(text) ||
    /^(?:(?:next|future)\s+)?routine follow[- ]?up\b/i.test(text) ||
    /^(?:next|future)\b.*\b(?:follow[- ]?up|visit|check|appointment)\b/i.test(text) ||
    /^follow[- ]?up\s+(?:in|with|after|for|recommended|planned|requested|needed)\b/i.test(text) ||
    /\b(?:should|needs? to)\s+(?:continue|follow|return|schedule)\b/i.test(text)
  )
}

function isEncounterReason(item: string) {
  return /^(?:reason\s+for\s+(?:the\s+)?(?:visit|encounter)|(?:visit|encounter)\s+reason)\b\s*[:\u2014-]?/i.test(
    item.trim(),
  )
}

function normalizedTextKey(item: string) {
  return item.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function uniqueText(
  items: string[],
  keyFor: (item: string) => string = normalizedTextKey,
) {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = keyFor(item)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function carePlanKey(item: string) {
  const normalized = normalizedTextKey(item)
    .replace(/^(?:the )?next /, '')
    .replace(/follow up/g, 'followup')
  const interval = normalized.match(
    /(?:in|within) (\d+)(?: to (\d+))? (day|days|week|weeks|month|months|year|years)/,
  )

  if (normalized.includes('followup') && interval) {
    const [, start, end, unit] = interval
    return `followup:${start}:${end ?? start}:${unit.replace(/s$/, '')}`
  }

  return normalized
}

function isSymptomOrFinding(item: string) {
  const text = item.trim()
  const symptom =
    /\b(?:shortness of breath|dyspnea|pain|fatigue|dizziness|nausea|cough|headache|swelling|weakness|palpitations)\b/i

  return (
    /\b(?:reading|readings|measurement|measurements|symptom|symptoms|finding|findings|observation|observations)\b/i.test(text) ||
    /\b\d{2,3}\s*\/\s*\d{2,3}(?:\s*mmhg)?\b/i.test(text) ||
    /\b(?:mmhg|bpm|mg\/dl|mmol\/l)\b/i.test(text) ||
    symptom.test(text) &&
      (/^(?:intermittent|persistent|occasional|recurrent|exertional|reported|reports?|history of)\b/i.test(text) ||
        new RegExp(`^${symptom.source}`, 'i').test(text))
  )
}

function isNotableSymptomOrOngoingFinding(item: string) {
  const text = item.trim()
  const symptom =
    /\b(?:shortness of breath|dyspnea|pain|fatigue|dizziness|nausea|cough|headache|swelling|weakness|palpitations)\b/i
  const ongoingFinding =
    /\b(?:persistent|ongoing|recurrent|intermittent|occasional)\b/i
  const routineVitalOrLab =
    /\b\d{2,3}\s*\/\s*\d{2,3}(?:\s*mmhg)?\b/i.test(text) ||
    /\b(?:blood pressure|bp)\s+(?:measurements?|was|of)\b/i.test(text) ||
    /\b(?:pulse|heart rate|temperature|respiratory rate)\b/i.test(text) ||
    /\b(?:cholesterol|lipids?|glucose|creatinine|potassium)\b/i.test(text) ||
    /\b(?:ecg|electrocardiogram)\b/i.test(text)

  if (routineVitalOrLab) return false

  const negativeSymptom = new RegExp(
    `(?:\\b(?:no|without|den(?:y|ies|ied))\\b[^.;]*${symptom.source}|${symptom.source}[^.;]*\\b(?:not reported|denied|absent)\\b)`,
    'i',
  )
  if (negativeSymptom.test(text) && !ongoingFinding.test(text)) return false

  return (
    symptom.test(text) ||
    ongoingFinding.test(text) ||
    /\b(?:elevated|high)\s+home\s+(?:blood pressure\s+)?readings?\b/i.test(text)
  )
}

function symptomAndFindingPresentationParts(item: string) {
  return item
    .split(
      /\s*;\s*|(?<=[.!?])\s+|,\s+(?=(?:no\b|without\b|den(?:y|ies|ied)\b|blood pressure\b|bp\b|pulse\b|heart rate\b|temperature\b|respiratory rate\b|cholesterol\b|lipids?\b|glucose\b|creatinine\b|potassium\b|ecg\b|electrocardiogram\b))/i,
    )
    .map((part) => part.trim())
    .filter(Boolean)
}

function eventsBelongToSameVisit(first: string, second: string) {
  const visitContext = /\b(?:visit|consultation|check[- ]?up|appointment)\b/i
  const vitalOrFinding =
    /\b(?:blood pressure|bp|pulse|heart rate|temperature|respiratory rate|oxygen saturation|weight|height|lab|result|finding|mmhg|bpm|mg\/dl|mmol\/l)\b/i
  const documentedCondition =
    /\b(?:diagnos(?:is|ed)|condition|first documented)\b/i

  return (
    visitContext.test(first) ||
    visitContext.test(second) ||
    documentedCondition.test(first) && vitalOrFinding.test(second) ||
    documentedCondition.test(second) && vitalOrFinding.test(first) ||
    vitalOrFinding.test(first) && vitalOrFinding.test(second)
  )
}

function combineSameDateEvents(events: OverviewEvent[]) {
  const combined: OverviewEvent[] = []
  const exactDateIndexes = new Map<string, number[]>()

  function conciseEventText(value: string, lowercaseFirst = false) {
    const concise = value
      .trim()
      .replace(/[.;]\s*$/, '')
      .replace(/\s+(?:at|during) this visit$/i, '')

    return lowercaseFirst && /^[A-Z][a-z]/.test(concise)
      ? `${concise[0].toLocaleLowerCase()}${concise.slice(1)}`
      : concise
  }

  for (const item of events) {
    const exactDate = item.date?.match(/^(\d{4}-\d{2}-\d{2})(?:T|$)/)?.[1]
    if (exactDate) {
      const existingIndex = exactDateIndexes
        .get(exactDate)
        ?.find((index) =>
          eventsBelongToSameVisit(combined[index].event, item.event),
        )
      if (existingIndex !== undefined) {
        const existing = combined[existingIndex]
        if (!existing.event.toLocaleLowerCase().includes(item.event.toLocaleLowerCase())) {
          existing.event = `${conciseEventText(existing.event)}; ${conciseEventText(item.event, true)}.`
        }
        continue
      }
      exactDateIndexes.set(exactDate, [
        ...(exactDateIndexes.get(exactDate) ?? []),
        combined.length,
      ])
    }
    combined.push({ ...item })
  }

  return combined
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
  const carePlanEvents = overview
    ? overview.important_medical_events.filter((item) =>
        isCarePlanOnly(item.event, item.date),
      )
    : []
  const importantEvents = overview
    ? combineSameDateEvents(
        overview.important_medical_events.filter(
          (item) => !isCarePlanOnly(item.event, item.date),
        ),
      )
    : []
  const carePlans = overview
    ? uniqueText(
        [
          ...(overview.follow_up_and_care_plans ?? []),
          ...carePlanEvents.map((item) => item.event),
        ].filter((item) => !isEncounterReason(item)),
        carePlanKey,
      )
    : []
  const symptomsAndFindings = overview
    ? uniqueText(
        [
          ...(overview.symptoms_and_findings ?? []),
          ...overview.conditions.filter(isSymptomOrFinding),
        ]
          .flatMap(symptomAndFindingPresentationParts)
          .filter(isNotableSymptomOrOngoingFinding),
      )
    : []
  const conditions = overview
    ? overview.conditions.filter((item) => !isSymptomOrFinding(item))
    : []

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
            <section className="records-card"><h2>Your conditions</h2><TextList items={conditions} /></section>
            <section className="records-card"><h2>Your allergies</h2><TextList items={overview.allergies} /></section>
            {symptomsAndFindings.length > 0 && (
              <section className="records-card overview-wide">
                <h2>Symptoms and findings</h2>
                <TextList items={symptomsAndFindings} />
              </section>
            )}
            <section className="records-card overview-wide"><h2>Previous procedures</h2><TextList items={overview.procedures} /></section>
            <section className="records-card overview-wide"><h2>Important medical events</h2>
              {importantEvents.length ? <ul>{importantEvents.map((item, index) => <li key={`${item.date}-${index}`}><strong>{item.date ? formatFriendlyDate(item.date) : 'Date not documented'}:</strong> {item.event}</li>)}</ul> : <p>None found in uploaded records.</p>}
            </section>
            {carePlans.length > 0 && (
              <section className="records-card overview-wide">
                <h2>Follow-up and care plans</h2>
                <p className="section-intro">
                  These instructions were documented in your medical records.
                </p>
                <TextList items={carePlans} />
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
