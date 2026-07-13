import React, { useMemo, useState } from 'react'
import * as store from '../lib/store.js'
import { STATUS_COLORS, STATUS_LABELS } from '../lib/store.js'
import AudioButton from './AudioButton.jsx'
import WordInfo from './WordInfo.jsx'
import Pronounce from './Pronounce.jsx'

// Grading buttons → new status
const GRADES = [
  ['Again', 'trouble', STATUS_COLORS.trouble, false],
  ['Hard', 'learning', STATUS_COLORS.learning, false],
  ['Good', 'recognize', STATUS_COLORS.recognize, true],
  ['Easy', 'learned', STATUS_COLORS.learned, true],
]

function buildQueue(words, settings) {
  const active = words.filter((w) => ['learning', 'trouble'].includes(w.status))
  const trouble = words.filter((w) => w.status === 'trouble')
  const learning = words.filter((w) => w.status === 'learning')
  const recognize = words
    .filter((w) => w.status === 'recognize')
    .sort((a, b) => (a.last_reviewed || '').localeCompare(b.last_reviewed || ''))
    .slice(0, 10)
  // Only introduce new words while under the learning limit
  const room = Math.max(0, (settings.learningLimit || 20) - active.length)
  const fresh = words
    .filter((w) => w.status === 'unknown')
    .slice(0, Math.min(room, settings.newPerSession || 10))
  const queue = [...trouble, ...learning, ...recognize, ...fresh]
  // shuffle
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[queue[i], queue[j]] = [queue[j], queue[i]]
  }
  return { queue, room, activeCount: active.length, freshCount: fresh.length }
}

export default function Flashcards({ words, profile, reload }) {
  const settings = profile?.settings || {}
  const [session, setSession] = useState(null) // {queue, index}
  const [flipped, setFlipped] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [done, setDone] = useState(null) // {reviewed, correct}
  const [direction, setDirection] = useState('pt-en') // or 'en-pt'

  const preview = useMemo(() => buildQueue(words, settings), [words, settings])

  const start = () => {
    const built = buildQueue(words, settings)
    setSession({ queue: built.queue, index: 0, correct: 0 })
    setFlipped(false)
    setShowInfo(false)
    setDone(null)
  }

  const grade = async (newStatus, isCorrect) => {
    const card = session.queue[session.index]
    await store.recordReview(card.id, isCorrect, newStatus)
    const next = session.index + 1
    if (next >= session.queue.length) {
      setDone({ reviewed: session.queue.length, correct: session.correct + (isCorrect ? 1 : 0) })
      setSession(null)
      reload()
    } else {
      setSession({ ...session, index: next, correct: session.correct + (isCorrect ? 1 : 0) })
      setFlipped(false)
      setShowInfo(false)
    }
  }

  if (done) {
    return (
      <div>
        <h1>Session complete 🎉</h1>
        <div className="card" style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '2rem', margin: 8 }}>
            {done.correct} / {done.reviewed}
          </p>
          <p className="muted">cards marked as known this session</p>
          <button className="btn" onClick={start}>Study again</button>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div>
        <h1>Flashcards</h1>
        <div className="card">
          <p>
            <strong>{preview.queue.length}</strong> cards ready:{' '}
            <span className="muted">
              {preview.activeCount} in progress + {preview.freshCount} new
            </span>
          </p>
          <p className="muted small">
            Learning limit: {preview.activeCount} / {settings.learningLimit || 20} words in progress
            {preview.room === 0 &&
              ' — limit reached, no new words will be introduced until you move some to Recognize or Learned (or raise the limit in Settings).'}
          </p>
          <div className="row">
            <div className="grow">
              <label>Direction</label>
              <select value={direction} onChange={(e) => setDirection(e.target.value)}>
                <option value="pt-en">Portuguese → English</option>
                <option value="en-pt">English → Portuguese</option>
              </select>
            </div>
          </div>
          <button className="btn" onClick={start} disabled={preview.queue.length === 0}>
            ▶ Start studying
          </button>
          {preview.queue.length === 0 && (
            <p className="muted small">No cards to study — add or import words first.</p>
          )}
        </div>
      </div>
    )
  }

  const card = session.queue[session.index]
  const front = direction === 'pt-en' ? card.portuguese : card.english
  const back = direction === 'pt-en' ? card.english : card.portuguese

  return (
    <div>
      <div className="row">
        <span className="muted small">
          Card {session.index + 1} / {session.queue.length}
        </span>
        <div className="grow progressbar" style={{ margin: 0 }}>
          <div style={{ width: ((session.index) / session.queue.length) * 100 + '%' }} />
        </div>
      </div>

      <div className="flashcard" onClick={() => setFlipped(!flipped)} style={{ marginTop: 12 }}>
        <div className="corner-left">
          <span className="badge" style={{ background: STATUS_COLORS[card.status] }}>
            {STATUS_LABELS[card.status]}
          </span>
        </div>
        <div className="corner">
          <AudioButton text={card.portuguese} />
        </div>
        {card.image_url && <img className="card-img" src={card.image_url} alt="" />}
        {!flipped ? (
          <>
            <div className="front-word">{front}</div>
            <div className="hint">tap to flip</div>
          </>
        ) : (
          <>
            <div className="front-word">{card.portuguese}</div>
            <div className="back-word">{back === card.portuguese ? card.english : back}</div>
            {card.notes && <p className="muted small">{card.notes}</p>}
            <div className="hint">how well did you know it?</div>
          </>
        )}
      </div>

      {flipped && (
        <>
          <div className="grade-row">
            {GRADES.map(([label, status, color, isCorrect]) => (
              <button key={label} style={{ background: color }} onClick={() => grade(status, isCorrect)}>
                {label}
                <div style={{ fontSize: '0.65rem', fontWeight: 400 }}>{STATUS_LABELS[status]}</div>
              </button>
            ))}
          </div>
          <div className="card" style={{ marginTop: 12 }}>
            <div className="row">
              <Pronounce target={card.portuguese} />
              <div className="grow" />
              <button className="btn ghost small" onClick={() => setShowInfo(!showInfo)}>
                {showInfo ? 'Hide info' : 'ℹ️ Info'}
              </button>
            </div>
            {showInfo && (
              <div style={{ marginTop: 10 }}>
                <WordInfo word={card} />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
