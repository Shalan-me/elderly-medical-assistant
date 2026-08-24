'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

import { createClient } from '@/lib/supabase/client'
import {
  saveTakenMedicationDose,
  type TakenMedicationLog,
} from '@/lib/supabase/medication-logs'

export type DashboardMedication = {
  id: string
  name: string
  dosage: string
  start_date: string
  end_date: string | null
  active: boolean
}

export type DashboardSchedule = {
  id: string
  medication_id: string
  scheduled_time: string
}

function localDateString() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function displayTime(value: string) {
  const [hours, minutes] = value.split(':').map(Number)
  const date = new Date()
  date.setHours(hours, minutes, 0, 0)
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function TodaysMedicationsCard({
  medications,
  schedules,
  initialLogs,
  loadError,
}: {
  medications: DashboardMedication[]
  schedules: DashboardSchedule[]
  initialLogs: TakenMedicationLog[]
  loadError: boolean
}) {
  const [logs, setLogs] = useState(initialLogs)
  const [busyScheduleId, setBusyScheduleId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const today = localDateString()

  const doses = useMemo(
    () =>
      schedules
        .map((schedule) => ({
          schedule,
          medication: medications.find(
            (medication) => medication.id === schedule.medication_id,
          ),
        }))
        .filter(({ medication }) =>
          Boolean(
            medication?.active &&
              medication.start_date <= today &&
              (!medication.end_date || medication.end_date >= today),
          ),
        )
        .sort((a, b) =>
          a.schedule.scheduled_time.localeCompare(b.schedule.scheduled_time),
        ),
    [medications, schedules, today],
  )

  async function markTaken(
    medication: DashboardMedication,
    schedule: DashboardSchedule,
  ) {
    setError('')
    setBusyScheduleId(schedule.id)

    try {
      const log = await saveTakenMedicationDose(createClient(), {
        medicationId: medication.id,
        scheduleId: schedule.id,
        scheduledDate: today,
      })
      setLogs((current) => [
        ...current.filter(
          (item) =>
            !(item.schedule_id === schedule.id && item.scheduled_date === today),
        ),
        log,
      ])
    } catch (saveError) {
      setError(
        saveError instanceof Error && saveError.message.includes('session has expired')
          ? saveError.message
          : 'We could not mark this dose as taken. Please try again.',
      )
    } finally {
      setBusyScheduleId(null)
    }
  }

  return (
    <article className="home-card home-card-primary today-home-card">
      <p className="home-card-kicker">Today</p>
      <h2>Today&apos;s medications</h2>

      {loadError ? (
        <p className="empty-state">Your medication schedule is unavailable right now.</p>
      ) : doses.length === 0 ? (
        <p className="empty-state">No medication doses are scheduled for today.</p>
      ) : (
        <ul className="dashboard-dose-list">
          {doses.map(({ medication, schedule }) => {
            if (!medication) return null
            const log = logs.find(
              (item) =>
                item.schedule_id === schedule.id && item.scheduled_date === today,
            )

            return (
              <li className="dashboard-dose" key={schedule.id}>
                <div className="dashboard-dose-time">
                  {displayTime(schedule.scheduled_time)}
                </div>
                <div className="dashboard-dose-details">
                  <h3>{medication.name}</h3>
                  <p>
                    {medication.dosage}
                    <span className="mobile-dose-time">
                      {' · '}{displayTime(schedule.scheduled_time)}
                    </span>
                  </p>
                </div>
                {log ? (
                  <div className="dashboard-taken-status">
                    <strong>Taken</strong>
                    <span>{displayTime(new Date(log.taken_at).toTimeString())}</span>
                  </div>
                ) : (
                  <button
                    className="primary-button dashboard-taken-button"
                    type="button"
                    disabled={busyScheduleId === schedule.id}
                    onClick={() => void markTaken(medication, schedule)}
                  >
                    {busyScheduleId === schedule.id ? 'Saving…' : 'Mark as Taken'}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {doses.length > 2 && (
        <p className="dashboard-more-doses">
          +{doses.length - 2} more {doses.length - 2 === 1 ? 'dose' : 'doses'} today
        </p>
      )}

      {error && <p className="form-alert error-alert dashboard-dose-error" role="alert">{error}</p>}

      <Link className="secondary-button action-link dashboard-schedule-link" href="/medications">
        View full schedule
      </Link>
    </article>
  )
}
