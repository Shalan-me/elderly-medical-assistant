'use client'

import Link from 'next/link'
import { FormEvent, useMemo, useRef, useState } from 'react'

import { createClient } from '@/lib/supabase/client'

export type Medication = {
  id: string
  user_id: string
  name: string
  dosage: string
  frequency: string
  instructions: string | null
  start_date: string
  end_date: string | null
  active: boolean
  source_record_id: string | null
  created_at: string
  updated_at: string
}

export type MedicationSchedule = {
  id: string
  medication_id: string
  scheduled_time: string
}

export type MedicationLog = {
  id: string
  medication_id: string
  schedule_id: string
  scheduled_date: string
  status: 'taken'
  taken_at: string
}

export type SourceRecord = {
  id: string
  file_name: string
  document_date: string | null
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

function displayDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
    new Date(`${value}T00:00:00`),
  )
}

export function MedicationManager({
  initialMedications,
  initialSchedules,
  initialLogs,
  sourceRecords,
  initialError,
}: {
  initialMedications: Medication[]
  initialSchedules: MedicationSchedule[]
  initialLogs: MedicationLog[]
  sourceRecords: SourceRecord[]
  initialError: string
}) {
  const formSectionRef = useRef<HTMLElement>(null)
  const [medications, setMedications] = useState(initialMedications)
  const [schedules, setSchedules] = useState(initialSchedules)
  const [logs, setLogs] = useState(initialLogs)
  const [editingMedication, setEditingMedication] = useState<Medication | null>(null)
  const [scheduleTimes, setScheduleTimes] = useState(['08:00'])
  const [error, setError] = useState(initialError)
  const [message, setMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const today = localDateString()

  const todaysDoses = useMemo(() => {
    return schedules
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
      )
  }, [medications, schedules, today])

  function clearNotices() {
    setError('')
    setMessage('')
  }

  function resetForm() {
    setEditingMedication(null)
    setScheduleTimes(['08:00'])
  }

  function beginEdit(medication: Medication) {
    clearNotices()
    setEditingMedication(medication)
    const medicationTimes = schedules
      .filter((schedule) => schedule.medication_id === medication.id)
      .map((schedule) => schedule.scheduled_time.slice(0, 5))
    setScheduleTimes(medicationTimes.length ? medicationTimes : ['08:00'])
    requestAnimationFrame(() =>
      formSectionRef.current?.scrollIntoView({ behavior: 'smooth' }),
    )
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    clearNotices()
    setIsSaving(true)
    const supabase = createClient()
    const formData = new FormData(event.currentTarget)

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError || !userData.user) {
        throw new Error('Your session has expired. Please log in again.')
      }

      const medicationValues = {
        user_id: userData.user.id,
        name: String(formData.get('name') ?? '').trim(),
        dosage: String(formData.get('dosage') ?? '').trim(),
        frequency: String(formData.get('frequency') ?? '').trim(),
        instructions: String(formData.get('instructions') ?? '').trim() || null,
        start_date: String(formData.get('start-date') ?? ''),
        end_date: String(formData.get('end-date') ?? '') || null,
        active: formData.get('active') === 'on',
        source_record_id: String(formData.get('source-record') ?? '') || null,
        updated_at: new Date().toISOString(),
      }

      let savedMedication: Medication
      const existingSchedules = editingMedication
        ? schedules.filter(
            (schedule) => schedule.medication_id === editingMedication.id,
          )
        : []
      if (editingMedication) {
        const { data, error: updateError } = await supabase
          .from('medications')
          .update(medicationValues)
          .eq('id', editingMedication.id)
          .select('*')
          .single()
        if (updateError) throw updateError
        savedMedication = data as Medication
      } else {
        const { data, error: insertError } = await supabase
          .from('medications')
          .insert(medicationValues)
          .select('*')
          .single()
        if (insertError) throw insertError
        savedMedication = data as Medication
      }

      const uniqueTimes = [...new Set(scheduleTimes)].sort()
      const removedScheduleIds = existingSchedules
        .filter(
          (schedule) =>
            !uniqueTimes.includes(schedule.scheduled_time.slice(0, 5)),
        )
        .map((schedule) => schedule.id)
      if (removedScheduleIds.length) {
        const { error: deleteScheduleError } = await supabase
          .from('medication_schedule')
          .delete()
          .in('id', removedScheduleIds)
        if (deleteScheduleError) throw deleteScheduleError
      }

      const retainedSchedules = existingSchedules.filter((schedule) =>
        uniqueTimes.includes(schedule.scheduled_time.slice(0, 5)),
      )
      const newTimes = uniqueTimes.filter(
        (time) =>
          !existingSchedules.some(
            (schedule) => schedule.scheduled_time.slice(0, 5) === time,
          ),
      )
      const { data: insertedSchedules, error: scheduleError } = newTimes.length
        ? await supabase
            .from('medication_schedule')
            .insert(
              newTimes.map((scheduledTime) => ({
                user_id: userData.user.id,
                medication_id: savedMedication.id,
                scheduled_time: scheduledTime,
              })),
            )
            .select('id, medication_id, scheduled_time')
        : { data: [], error: null }
      if (scheduleError) throw scheduleError
      const savedSchedules = [
        ...retainedSchedules,
        ...((insertedSchedules ?? []) as MedicationSchedule[]),
      ]

      setMedications((current) =>
        editingMedication
          ? current.map((item) =>
              item.id === savedMedication.id ? savedMedication : item,
            )
          : [...current, savedMedication].sort((a, b) =>
              a.name.localeCompare(b.name),
            ),
      )
      setSchedules((current) => [
        ...current.filter(
          (schedule) => schedule.medication_id !== savedMedication.id,
        ),
        ...savedSchedules,
      ])
      setMessage(
        editingMedication
          ? `${savedMedication.name} was updated.`
          : `${savedMedication.name} was added.`,
      )
      resetForm()
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'The medication could not be saved.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  async function markTaken(
    medication: Medication,
    schedule: MedicationSchedule,
  ) {
    clearNotices()
    setBusyId(schedule.id)
    const supabase = createClient()

    try {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error('Your session has expired.')
      const takenAt = new Date().toISOString()
      const { data, error: logError } = await supabase
        .from('medication_logs')
        .upsert(
          {
            user_id: userData.user.id,
            medication_id: medication.id,
            schedule_id: schedule.id,
            scheduled_date: today,
            status: 'taken',
            taken_at: takenAt,
          },
          { onConflict: 'schedule_id,scheduled_date' },
        )
        .select('id, medication_id, schedule_id, scheduled_date, status, taken_at')
        .single()
      if (logError) throw logError

      setLogs((current) => [
        ...current.filter(
          (log) =>
            !(log.schedule_id === schedule.id && log.scheduled_date === today),
        ),
        data as MedicationLog,
      ])
      setMessage(`${medication.name} was marked as taken.`)
    } catch (logError) {
      setError(
        logError instanceof Error ? logError.message : 'Could not mark this dose as taken.',
      )
    } finally {
      setBusyId(null)
    }
  }

  async function deleteMedication(medication: Medication) {
    if (!window.confirm(`Delete ${medication.name} and its schedule?`)) return
    clearNotices()
    setBusyId(medication.id)
    const supabase = createClient()

    try {
      const { error: deleteError } = await supabase
        .from('medications')
        .delete()
        .eq('id', medication.id)
      if (deleteError) throw deleteError

      setMedications((current) =>
        current.filter((item) => item.id !== medication.id),
      )
      setSchedules((current) =>
        current.filter((item) => item.medication_id !== medication.id),
      )
      setLogs((current) =>
        current.filter((item) => item.medication_id !== medication.id),
      )
      if (editingMedication?.id === medication.id) resetForm()
      setMessage(`${medication.name} was deleted.`)
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : 'The medication could not be deleted.',
      )
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main className="records-page">
      <div className="records-shell medication-shell">
        <header className="records-header">
          <div>
            <p className="eyebrow">Elderly Medical Assistant</p>
            <h1>Medical schedule</h1>
          </div>
          <Link className="text-link" href="/dashboard">Back to dashboard</Link>
        </header>

        {error && <p className="form-alert error-alert" role="alert">{error}</p>}
        {message && <p className="form-alert success-alert" role="status">{message}</p>}

        <section className="records-card" aria-labelledby="today-heading">
          <h2 id="today-heading">Today&apos;s medications</h2>
          <p className="section-intro">{displayDate(today)}</p>
          {todaysDoses.length === 0 ? (
            <p className="empty-state">No medications are scheduled for today.</p>
          ) : (
            <ul className="dose-list">
              {todaysDoses.map(({ medication, schedule }) => {
                if (!medication) return null
                const log = logs.find(
                  (item) =>
                    item.schedule_id === schedule.id &&
                    item.scheduled_date === today,
                )
                return (
                  <li className="dose-item" key={schedule.id}>
                    <div className="dose-time">{displayTime(schedule.scheduled_time)}</div>
                    <div className="dose-details">
                      <h3>{medication.name}</h3>
                      <p>{medication.dosage}</p>
                      {medication.instructions && <p>{medication.instructions}</p>}
                    </div>
                    {log ? (
                      <div className="taken-status">
                        <strong>Taken</strong>
                        <span>{displayTime(new Date(log.taken_at).toTimeString())}</span>
                      </div>
                    ) : (
                      <button
                        className="primary-button"
                        type="button"
                        disabled={busyId === schedule.id}
                        onClick={() => markTaken(medication, schedule)}
                      >
                        {busyId === schedule.id ? 'Saving…' : 'Mark as Taken'}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="records-card" aria-labelledby="active-heading">
          <h2 id="active-heading">Active medications</h2>
          {medications.filter((medication) => medication.active).length === 0 ? (
            <p className="empty-state">You have no active medications.</p>
          ) : (
            <ul className="medication-list">
              {medications.filter((medication) => medication.active).map((medication) => (
                <li className="medication-item" key={medication.id}>
                  <div>
                    <h3>{medication.name}</h3>
                    <p><strong>{medication.dosage}</strong> — {medication.frequency}</p>
                    {medication.instructions && <p>{medication.instructions}</p>}
                    <p className="field-help">Started {displayDate(medication.start_date)}{medication.end_date ? ` · Ends ${displayDate(medication.end_date)}` : ''}</p>
                  </div>
                  <div className="record-actions">
                    <button className="secondary-button compact-button" type="button" onClick={() => beginEdit(medication)}>Edit</button>
                    <button className="danger-button compact-button" type="button" disabled={busyId === medication.id} onClick={() => deleteMedication(medication)}>Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section ref={formSectionRef} className="records-card" aria-labelledby="add-heading">
          <h2 id="add-heading">{editingMedication ? 'Edit medication' : 'Add medication'}</h2>
          <form key={editingMedication?.id ?? 'new'} className="medication-form" onSubmit={handleSave}>
            <div className="medication-form-grid">
              <div className="field-group">
                <label htmlFor="name">Medication name</label>
                <input id="name" name="name" required defaultValue={editingMedication?.name} />
              </div>
              <div className="field-group">
                <label htmlFor="dosage">Dosage</label>
                <input id="dosage" name="dosage" required placeholder="For example, 10 mg" defaultValue={editingMedication?.dosage} />
              </div>
              <div className="field-group">
                <label htmlFor="frequency">Frequency</label>
                <input id="frequency" name="frequency" required placeholder="For example, twice daily" defaultValue={editingMedication?.frequency} />
              </div>
              <div className="field-group">
                <label htmlFor="instructions">Instructions</label>
                <input id="instructions" name="instructions" placeholder="For example, take with food" defaultValue={editingMedication?.instructions ?? ''} />
              </div>
              <div className="field-group">
                <label htmlFor="start-date">Start date</label>
                <input id="start-date" name="start-date" type="date" required defaultValue={editingMedication?.start_date ?? today} />
              </div>
              <div className="field-group">
                <label htmlFor="end-date">End date</label>
                <input id="end-date" name="end-date" type="date" defaultValue={editingMedication?.end_date ?? ''} />
                <p className="field-help">Optional</p>
              </div>
              <div className="field-group medication-form-wide">
                <label htmlFor="source-record">Source medical record</label>
                <select id="source-record" name="source-record" defaultValue={editingMedication?.source_record_id ?? ''}>
                  <option value="">None — entered manually</option>
                  {sourceRecords.map((record) => <option key={record.id} value={record.id}>{record.file_name}</option>)}
                </select>
                <p className="field-help">Optional. AI-extracted medications are not added automatically.</p>
              </div>
            </div>

            <fieldset className="schedule-fieldset">
              <legend>Scheduled times</legend>
              <p>Add one or more times for this medication.</p>
              {scheduleTimes.map((time, index) => (
                <div className="schedule-time-row" key={index}>
                  <label htmlFor={`schedule-time-${index}`}>Time {index + 1}</label>
                  <input id={`schedule-time-${index}`} type="time" required value={time} onChange={(event) => setScheduleTimes((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} />
                  <button className="secondary-button compact-button" type="button" disabled={scheduleTimes.length === 1} onClick={() => setScheduleTimes((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
                </div>
              ))}
              <button className="secondary-button" type="button" onClick={() => setScheduleTimes((current) => [...current, '12:00'])}>Add another time</button>
            </fieldset>

            <label className="checkbox-label">
              <input name="active" type="checkbox" defaultChecked={editingMedication?.active ?? true} />
              This medication is active
            </label>

            <div className="form-actions">
              <button className="primary-button" type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : editingMedication ? 'Save changes' : 'Add medication'}</button>
              {editingMedication && <button className="secondary-button" type="button" onClick={resetForm}>Cancel editing</button>}
            </div>
          </form>
        </section>
      </div>
    </main>
  )
}
