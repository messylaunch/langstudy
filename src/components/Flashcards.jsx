import React, { useEffect, useMemo, useState } from 'react'
import * as store from '../lib/store.js'
import { STATUS_COLORS, STATUS_LABELS } from '../lib/store.js'
import AudioButton from './AudioButton.jsx'
import WordInfo from './WordInfo.jsx'
import Pronounce from './Pronounce.jsx'
import { setCurrentWord } from '../lib/uiContext.js'
import { pressable } from '../lib/a11y.js'

// Grading buttons. 'Good' resolves per-card: it never demotes a word that is
// already Learned — see gradeStatus().
const GRADES = [
  ['Again', 'trouble', STATUS_COLORS.trouble, false],
  ['Hard', 'learning', STATUS_COLORS.learning, false],
  ['Good', 'recognize', STATUS_COLORS.recognize, true],
  ['Easy', 'learned', STATUS_COLORS.learned, true],
]

function gradeStatus(card, target) {
  if (target === 'recognize' && card.status === 'learned') return 'learned'
  return target
}

const MAX_REVIEWS_PER_SESSION = 30

function buildQueue(words, settings, scope, direction) {
  // Session scope: everything, one category, or only recently added words
  // (so you can drill exactly what this week's class covered).
  let pool = words
  // EN→PT cards need an English side to show; PT-only imports are common.
  if (direction === 'en-pt') pool = pool.filter((w) => (w.english || '').trim())
  if (scope.category && scope.category !== 'all') {
    pool = pool.filter((w) => (w.category || 'general') === scope.category)
  }
  if (scope.recentDays) {
    const cutoff = new Date(Date.now() - scope.recentDays * 86400000).toISOString()
    pool = pool.filter((w) => (w.created_at || '') >= cutoff)
  }

  // Reviews: words due by status age — trouble words FIRST (lapses are the
  // highest-priority reviews), then everything else oldest-first, capped so
  // sessions stay a sane length.
  const now = new Date()
  const dueAll = pool
    .filter((w) => w.status !== 'unknown' && store.isDue(w, now))
    .sort((a, b) => (a.last_reviewed || '').localeCompare(b.last_reviewed || ''))
  const due = [
    ...dueAll.filter((w) => w.status === 'trouble'),
    ...dueAll.filter((w) => w.status !== 'trouble'),
  ].slice(0, MAX_REVIEWS_PER_SESSION)

  // New words: only while the global learning limit has room.
  const active = words.filter((w) => ['learning', 'trouble'].includes(w.status))
  const room = Math.max(0, (settings.learningLimit || 20) - active.length)
  const fresh = pool
    .filter((w) => w.status === 'unknown')
    .slice(0, Math.min(room, settings.newPerSession || 10))
  const blockedByLimit = room === 0 && pool.some((w) => w.status === 'unknown')

  const queue = [...due, ...fresh]
  // shuffle
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[queue[i], queue[j]] = [queue[j], queue[i]]
  }
  return {
    queue,
    room,
    activeCount: active.length,
    freshCount: fresh.length,
    dueCount: due.length,
    blockedByLimit,
  }
}

export default function Flashcards({ words, profile, reload, onLesson }) {
  const settings = profile?.settings || {}
  const [session, setSession] = useState(null) // {queue, index}
  const [flipped, setFlipped] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [done, setDone] = useState(null) // {reviewed, correct}
  const [direction, setDirection] = useState('pt-en') // or 'en-pt'
  const [scopeCategory, setScopeCategory] = useState('all')
  const [scopeRecent, setScopeRecent] = useState(0) // 0 = all time

  const scope = useMemo(
    () => ({ category: scopeCategory, recentDays: Number(scopeRecent) || 0 }),
    [scopeCategory, scopeRecent]
  )
  const categories = useMemo(() => {
    const set = new Set(words.map((w) => w.category || 'general'))
    return ['all', ...[...set].sort()]
  }, [words])

  const preview = useMemo(
    () => buildQueue(words, settings, scope, direction),
    [words, settings, scope, direction]
  )

  // Tell the AI chat which word is on screen; clear it when leaving this view.
  const currentPt = session ? session.queue[session.index]?.portuguese : null
  useEffect(() => {
    setCurrentWord(currentPt || null)
    return () => setCurrentWord(null)
  }, [currentPt])

  const start = () => {
    const built = buildQueue(words, settings, scope, direction)
    setSession({ queue: built.queue, index: 0, correct: 0 })
    setFlipped(false)
    setShowInfo(false)
    setDone(null)
  }

  const [grading, setGrading] = useState(false)

  const grade = async (targetStatus, isCorrect) => {
    if (grading) return // guard against double-taps recording the card twice
    setGrading(true)
    try {
      await gradeInner(targetStatus, isCorrect)
    } finally {
      setGrading(false)
    }
  }

  const gradeInner = async (targetStatus, isCorrect) => {
    const card = session.queue[session.index]
    await store.recordReview(card.id, isCorrect, gradeStatus(card, targetStatus))
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
              {preview.dueCount} due for review + {preview.freshCount} new
            </span>
          </p>
          <p className="muted small">
            Learning limit: {preview.activeCount} / {settings.learningLimit || 20} words in progress
            {preview.room === 0 &&
              ' — limit reached, no new words will be introduced until you move some to Recognize or Learned (or raise the limit in Settings).'}
          </p>
          <div className="row">
            <div className="grow" style={{ minWidth: 150 }}>
              <label>Direction</label>
              <select value={direction} onChange={(e) => setDirection(e.target.value)}>
                <option value="pt-en">Portuguese → English</option>
                <option value="en-pt">English → Portuguese</option>
              </select>
            </div>
            <div className="grow" style={{ minWidth: 150 }}>
              <label>Category</label>
              <select value={scopeCategory} onChange={(e) => setScopeCategory(e.target.value)}>
                {categories.map((c) => (
                  <option key={c} value={c}>{c === 'all' ? 'All categories' : c}</option>
                ))}
              </select>
            </div>
            <div className="grow" style={{ minWidth: 150 }}>
              <label>Words added</label>
              <select value={scopeRecent} onChange={(e) => setScopeRecent(e.target.value)}>
                <option value={0}>Any time</option>
                <option value={7}>Last 7 days (this week's class)</option>
                <option value={30}>Last 30 days</option>
              </select>
            </div>
          </div>
          <button className="btn" onClick={start} disabled={preview.queue.length === 0}>
            ▶ Start studying
          </button>
          {preview.queue.length === 0 && (
            <p className="muted small">
              {preview.blockedByLimit
                ? `New words here are waiting because your learning limit (${settings.learningLimit || 20}) is full. Move some words to Recognize or Learned, or raise the limit in Settings.`
                : 'Nothing to study in this scope right now — every reviewed word is resting until it comes due again. Widen the scope, or add/import more words.'}
            </p>
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

      <div
        className="flashcard"
        onClick={() => setFlipped(!flipped)}
        {...pressable(() => setFlipped(!flipped))}
        aria-label={flipped ? 'Flashcard, back side' : 'Flashcard, tap to flip'}
        style={{ marginTop: 12 }}
      >
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
            <div className="back-word">
              {(back === card.portuguese ? card.english : back) || (
                <span className="muted">no translation yet — tap ℹ️ Info or edit the word</span>
              )}
            </div>
            {card.notes && <p className="muted small">{card.notes}</p>}
            <div className="hint">how well did you know it?</div>
          </>
        )}
      </div>

      {flipped && (
        <>
          <div className="grade-row">
            {GRADES.map(([label, status, color, isCorrect]) => (
              <button key={label} style={{ background: color }} disabled={grading} onClick={() => grade(status, isCorrect)}>
                {label}
                <div style={{ fontSize: '0.72rem', fontWeight: 400 }}>
                  {STATUS_LABELS[gradeStatus(card, status)].replace('Trouble remembering', 'Trouble')}
                </div>
              </button>
            ))}
          </div>
          <div className="card" style={{ marginTop: 12 }}>
            <div className="row">
              <Pronounce target={card.portuguese} />
              <div className="grow" />
              {onLesson && (
                <button
                  className="btn ghost small"
                  title="Generate a mini lesson about this word"
                  onClick={() => onLesson(`the word "${card.portuguese}" (${card.english}) — usage, forms, and common phrases`)}
                >
                  📖 Lesson
                </button>
              )}
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
