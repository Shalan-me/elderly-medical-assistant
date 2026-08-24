export default function Loading() {
  return (
    <main className="loading-page">
      <div className="loading-card" role="status" aria-live="polite">
        <div className="loading-spinner" aria-hidden="true" />
        <h1>Loading your information</h1>
        <p>Please wait a moment.</p>
      </div>
    </main>
  )
}
