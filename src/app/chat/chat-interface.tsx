'use client'

import type { FormEvent } from 'react'
import { useRef, useState } from 'react'

type Source = { id: string; fileName: string }
type Message = {
  id: number
  role: 'user' | 'assistant'
  content: string
  sources?: Source[]
}

const suggestedQuestions = [
  'What medications are in my records?',
  'What conditions have been documented?',
  'What did my latest check-up say?',
  'When was hypertension first mentioned?',
]

export function ChatInterface() {
  const nextMessageId = useRef(0)
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  async function askQuestion(nextQuestion: string) {
    const trimmedQuestion = nextQuestion.trim()
    if (!trimmedQuestion || isLoading) return

    const userMessage: Message = {
      id: ++nextMessageId.current,
      role: 'user',
      content: trimmedQuestion,
    }
    setMessages((current) => [...current, userMessage])
    setQuestion('')
    setError('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmedQuestion }),
      })
      const result = (await response.json()) as {
        answer?: string
        error?: string
        sources?: Source[]
      }
      if (!response.ok || !result.answer) {
        throw new Error(result.error || 'We could not answer that question.')
      }

      setMessages((current) => [
        ...current,
        {
          id: ++nextMessageId.current,
          role: 'assistant',
          content: result.answer as string,
          sources: result.sources,
        },
      ])
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'We could not answer that question. Please try again.',
      )
    } finally {
      setIsLoading(false)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void askQuestion(question)
  }

  return (
    <section className="records-card chat-card" aria-labelledby="chat-heading">
      <h2 id="chat-heading">Ask a question</h2>

      <div className="suggested-questions" aria-label="Suggested questions">
        <p>Try one of these questions:</p>
        <div>
          {suggestedQuestions.map((suggestion) => (
            <button
              className="suggestion-button"
              disabled={isLoading}
              key={suggestion}
              onClick={() => void askQuestion(suggestion)}
              type="button"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>

      <div
        className="chat-messages"
        aria-busy={isLoading}
        aria-live="polite"
        aria-label="Conversation"
      >
        {messages.length === 0 ? (
          <p className="empty-state">
            Your answers will appear here. Only relevant parts of your records
            are used for each question.
          </p>
        ) : (
          messages.map((message) => (
            <article
              className={`chat-message chat-message-${message.role}`}
              key={message.id}
            >
              <h3>{message.role === 'user' ? 'You asked' : 'Answer'}</h3>
              <p>{message.content}</p>
              {message.role === 'assistant' && message.sources?.length ? (
                <div className="chat-sources">
                  <strong>Source records:</strong>
                  <ul>
                    {message.sources.map((source) => (
                      <li key={source.id}>
                        <a
                          className="text-link"
                          href={`/records/${source.id}`}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {source.fileName}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </article>
          ))
        )}
        {isLoading ? <p className="chat-loading">Checking your records…</p> : null}
      </div>

      {error ? <p className="form-alert error-alert">{error}</p> : null}

      <form className="chat-form" onSubmit={handleSubmit}>
        <label htmlFor="chat-question">Your question</label>
        <textarea
          id="chat-question"
          maxLength={1000}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Type a question about your medical records"
          rows={3}
          value={question}
        />
        <button
          className="primary-button"
          disabled={isLoading || !question.trim()}
          type="submit"
        >
          {isLoading ? 'Checking records…' : 'Ask my records'}
        </button>
      </form>
    </section>
  )
}
