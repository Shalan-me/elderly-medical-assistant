'use client'

import Link from 'next/link'
import { FormEvent, useRef, useState } from 'react'

import { createClient } from '@/lib/supabase/client'

export type MedicalRecord = {
  id: string
  file_name: string
  storage_path: string
  document_type: string | null
  document_date: string | null
  created_at: string
  processing_status: 'processing' | 'completed' | 'failed'
  processing_error: string | null
}

const BUCKET = 'medical-records'
const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_FILE_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
])

function safeFileName(fileName: string) {
  const extension = fileName.includes('.') ? `.${fileName.split('.').pop()}` : ''
  return `${crypto.randomUUID()}${extension.toLowerCase()}`
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(
    new Date(`${value}T00:00:00`),
  )
}

export function RecordsManager({
  records,
  initialError = '',
}: {
  records: MedicalRecord[]
  initialError?: string
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [visibleRecords, setVisibleRecords] = useState(records)
  const [error, setError] = useState(initialError)
  const [message, setMessage] = useState('')
  const [busyRecordId, setBusyRecordId] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')

    const formData = new FormData(event.currentTarget)
    const file = formData.get('record-file')
    const documentType = String(formData.get('document-type') ?? '').trim()
    const documentDate = String(formData.get('document-date') ?? '') || null

    if (!(file instanceof File) || file.size === 0) {
      setError('Please choose a PDF or image file.')
      return
    }
    if (!ALLOWED_FILE_TYPES.has(file.type)) {
      setError('Only PDF, JPEG, PNG, or WebP files are allowed.')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('The selected file is larger than 10 MB.')
      return
    }

    setIsUploading(true)
    setUploadProgress('Uploading your file…')
    const supabase = createClient()

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError || !userData.user) throw new Error('Your session has expired. Please log in again.')

      const storagePath = `${userData.user.id}/${safeFileName(file.name)}`
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, { contentType: file.type, upsert: false })
      if (uploadError) throw uploadError

      const { data: newRecord, error: recordError } = await supabase
        .from('medical_records')
        .insert({
          user_id: userData.user.id,
          file_name: file.name,
          storage_path: storagePath,
          document_type: documentType || null,
          document_date: documentDate,
        })
        .select(
          'id, file_name, storage_path, document_type, document_date, created_at, processing_status, processing_error',
        )
        .single()

      if (recordError || !newRecord) {
        await supabase.storage.from(BUCKET).remove([storagePath])
        throw recordError ?? new Error('The record could not be saved.')
      }

      setVisibleRecords((currentRecords) => [newRecord, ...currentRecords])
      formRef.current?.reset()
      setMessage('Your record was uploaded and is being processed.')
      setUploadProgress('Upload complete. AI is reading your record. This may take a minute…')

      const processingResponse = await fetch(`/api/records/${newRecord.id}/process`, {
        method: 'POST',
      })
      const processingResult = (await processingResponse.json()) as {
        record?: MedicalRecord
        error?: string
        overviewWarning?: string | null
      }

      if (!processingResponse.ok || !processingResult.record) {
        setVisibleRecords((currentRecords) =>
          currentRecords.map((currentRecord) =>
            currentRecord.id === newRecord.id
              ? {
                  ...currentRecord,
                  processing_status: 'failed',
                  processing_error: processingResult.error ?? 'AI processing failed.',
                }
              : currentRecord,
          ),
        )
        setError(`The file was uploaded, but AI processing failed: ${processingResult.error ?? 'Please try again later.'}`)
        setMessage('')
        return
      }

      setVisibleRecords((currentRecords) =>
        currentRecords.map((currentRecord) =>
          currentRecord.id === newRecord.id ? processingResult.record! : currentRecord,
        ),
      )
      setMessage(processingResult.overviewWarning ?? 'Your medical record was processed successfully.')
    } catch (uploadError) {
      setError(
        uploadError instanceof Error && uploadError.message.includes('session has expired')
          ? uploadError.message
          : 'We could not upload this record. Please check your connection and try again.',
      )
    } finally {
      setIsUploading(false)
      setUploadProgress('')
    }
  }

  async function handleDelete(record: MedicalRecord) {
    if (!window.confirm(`Delete ${record.file_name}? This cannot be undone.`)) return

    setError('')
    setMessage('')
    setBusyRecordId(record.id)
    const supabase = createClient()

    try {
      const { error: storageError } = await supabase.storage
        .from(BUCKET)
        .remove([record.storage_path])
      if (storageError) throw storageError

      const { error: recordError } = await supabase
        .from('medical_records')
        .delete()
        .eq('id', record.id)
      if (recordError) throw recordError

      setVisibleRecords((currentRecords) =>
        currentRecords.filter((currentRecord) => currentRecord.id !== record.id),
      )
      setMessage(`${record.file_name} was deleted.`)
    } catch {
      setError('We could not delete this record. Please try again.')
    } finally {
      setBusyRecordId(null)
    }
  }

  return (
    <main className="records-page">
      <div className="records-shell">
        <header className="records-header">
          <div>
            <p className="eyebrow">Elderly Medical Assistant</p>
            <h1>Medical records</h1>
          </div>
          <Link className="text-link" href="/dashboard">Back to dashboard</Link>
        </header>

        <section className="records-card" aria-labelledby="upload-heading">
          <h2 id="upload-heading">Upload a record</h2>
          <p>Accepted files: PDF, JPEG, PNG, or WebP. Maximum size: 10 MB.</p>
          <form ref={formRef} className="auth-form" onSubmit={handleUpload} aria-busy={isUploading}>
            <div className="field-group">
              <label htmlFor="record-file">Choose a file</label>
              <input id="record-file" name="record-file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required disabled={isUploading} />
            </div>
            <div className="field-group">
              <label htmlFor="document-type">Document type</label>
              <select id="document-type" name="document-type" disabled={isUploading} defaultValue="">
                <option value="">Not sure — let AI determine it</option>
                <option value="Lab result">Lab result</option>
                <option value="Prescription">Prescription</option>
                <option value="Visit summary">Visit summary</option>
                <option value="Imaging">Imaging</option>
                <option value="Other">Other</option>
              </select>
              <p className="field-help">Optional. Choose “Not sure” to let AI determine it.</p>
            </div>
            <div className="field-group">
              <label htmlFor="document-date">Document date</label>
              <input id="document-date" name="document-date" type="date" disabled={isUploading} />
              <p className="field-help">Optional</p>
            </div>
            <button className="primary-button" type="submit" disabled={isUploading}>
              {isUploading ? 'Uploading and processing…' : 'Upload record'}
            </button>
            {uploadProgress && (
              <p className="progress-state" role="status" aria-live="polite">
                {uploadProgress}
              </p>
            )}
          </form>
        </section>

        {error && <p className="form-alert error-alert" role="alert">{error}</p>}
        {message && <p className="form-alert success-alert" role="status">{message}</p>}

        <section className="records-card" aria-labelledby="records-heading">
          <h2 id="records-heading">Your uploaded records</h2>
          {visibleRecords.length === 0 ? (
            <div className="empty-state">
              <strong>No medical records yet</strong>
              <p>Use the upload form above to add your first PDF or image.</p>
            </div>
          ) : (
            <ul className="records-list">
              {visibleRecords.map((record) => (
                <li className="record-item" key={record.id}>
                  <div>
                    <h3>{record.file_name}</h3>
                    <p>{record.document_type || 'Document type not determined yet'}</p>
                    <p>{record.document_date ? formatDate(record.document_date) : 'No document date'}</p>
                    <p className={`status-badge status-${record.processing_status}`}>
                      AI status: {record.processing_status}
                    </p>
                    {record.processing_status === 'failed' && record.processing_error && (
                      <p className="record-error">{record.processing_error}</p>
                    )}
                  </div>
                  <div className="record-actions">
                    <a className="primary-button action-link" href={`/records/${record.id}`} target="_blank" rel="noopener noreferrer">Open record</a>
                    <button className="danger-button" type="button" disabled={busyRecordId === record.id} onClick={() => handleDelete(record)}>
                      {busyRecordId === record.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}
