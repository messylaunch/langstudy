import React, { useEffect, useState } from 'react'
import * as store from '../lib/store.js'
import { generateLesson, aiAvailable } from '../lib/ai.js'
import AudioButton from './AudioButton.jsx'

export function LessonView({ lesson, onBack, onDelete }) {
  const c = lesson.content || {}
  return (
    <div className="card lesson-view">
      <div className="row">
        <h2 style={{ margin: 0 }} className="grow">{c.title || lesson.title}</h2>
        {onBack && <button className="btn ghost small" onClick={onBack}>← Back</button>}
      </div>
      <p className="muted small">
        {c.level && c.level !== 'chat' ? c.level + ' · ' : ''}
        {lesson.source === 'chat' ? 'saved from a chat with Zé · ' : ''}
        {String(lesson.created_at || '').slice(0, 10)}
      </p>
      {(c.sections || []).map((s, i) => (
        <div key={i}>
          <h2>{s.heading}</h2>
          <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{s.body}</p>
          {(s.examples || []).map((ex, j) => (
            <div className="example" key={j}>
              <div>
                {ex.pt} <AudioButton text={ex.pt} />
              </div>
              <div className="en">{ex.en}</div>
            </div>
          ))}
        </div>
      ))}
      {(c.practice || []).length > 0 && (
        <div className="practice" style={{ marginTop: 14 }}>
          <strong>✏️ Try it yourself</strong>
          {(c.practice || []).map((p, i) => (
            <PracticeItem key={i} item={p} />
          ))}
        </div>
      )}
      {onDelete && (
        <button className="btn danger small" style={{ marginTop: 14 }} onClick={onDelete}>
          Delete lesson
        </button>
      )}
    </div>
  )
}

function PracticeItem({ item }) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ margin: '8px 0' }}>
      <div>{item.en}</div>
      {show ? (
        <div className="success">
          {item.pt} <AudioButton text={item.pt} />
        </div>
      ) : (
        <button className="btn ghost small" onClick={() => setShow(true)}>
          Show answer
        </button>
      )}
    </div>
  )
}

export default function Lessons({ seedTopic, onSeedConsumed }) {
  const [lessons, setLessons] = useState([])
  const [search, setSearch] = useState('')
  const [current, setCurrent] = useState(null)
  const [topic, setTopic] = useState(seedTopic || '')
  const [detail, setDetail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    store.listLessons().then(setLessons).catch(() => {})
  }, [])

  useEffect(() => {
    if (seedTopic) {
      setTopic(seedTopic)
      onSeedConsumed?.()
    }
  }, [seedTopic]) // eslint-disable-line react-hooks/exhaustive-deps

  const generate = async () => {
    if (!topic.trim()) return
    setBusy(true)
    setError('')
    try {
      const content = await generateLesson(topic.trim(), detail.trim())
      const saved = await store.saveLesson({
        title: content.title || topic.trim(),
        topic: topic.trim(),
        source: 'generated',
        content,
      })
      setLessons([saved, ...lessons])
      setCurrent(saved)
      setTopic('')
      setDetail('')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (lesson) => {
    if (!confirm(`Delete "${lesson.title}"?`)) return
    await store.deleteLesson(lesson.id)
    setLessons(lessons.filter((l) => l.id !== lesson.id))
    setCurrent(null)
  }

  if (current) {
    return (
      <div>
        <h1>Mini lesson</h1>
        <LessonView lesson={current} onBack={() => setCurrent(null)} onDelete={() => remove(current)} />
      </div>
    )
  }

  const q = search.trim().toLowerCase()
  const filtered = q
    ? lessons.filter(
        (l) =>
          (l.title || '').toLowerCase().includes(q) ||
          (l.topic || '').toLowerCase().includes(q) ||
          JSON.stringify(l.content || {}).toLowerCase().includes(q)
      )
    : lessons

  return (
    <div>
      <h1>Mini lessons</h1>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>✨ Generate a lesson</h2>
        <p className="muted small">
          Ask for anything educational — "conjugating ir in the past", "phrases for ordering food",
          "when to use ser vs estar"…
        </p>
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="What do you want a lesson on?"
        />
        <input
          type="text"
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder="Anything specific you're confused about? (optional)"
        />
        {!aiAvailable() && (
          <p className="muted small">Needs AI — see Settings → Connections.</p>
        )}
        {error && <p className="error">{error}</p>}
        <button className="btn" onClick={generate} disabled={busy || !topic.trim()}>
          {busy ? 'Building your lesson…' : 'Generate lesson'}
        </button>
      </div>

      <div className="card">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search your lessons…"
        />
        {filtered.length === 0 && (
          <p className="muted">
            {lessons.length === 0
              ? 'No lessons yet. Generate one above, or save an answer from the chat with Zé.'
              : 'No lessons match that search.'}
          </p>
        )}
        {filtered.map((l) => (
          <div className="word-row lesson-row" key={l.id} onClick={() => setCurrent(l)}>
            <div className="grow">
              <div className="pt">
                {l.source === 'chat' ? '💬' : '📖'} {l.title}
              </div>
              <div className="meta">
                {l.topic} · {String(l.created_at || '').slice(0, 10)}
              </div>
            </div>
            <span className="muted">›</span>
          </div>
        ))}
      </div>
    </div>
  )
}
