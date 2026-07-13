import React, { useState } from 'react'
import * as store from '../lib/store.js'
import { normalizePt } from '../lib/speech.js'
import AudioButton from './AudioButton.jsx'

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildQuiz(words, mode, n = 10) {
  // quiz words you're working on first; fall back to anything with a translation
  const pool = words.filter((w) => w.english)
  const primary = pool.filter((w) => ['learning', 'trouble', 'recognize'].includes(w.status))
  const source = primary.length >= 4 ? primary : pool
  return shuffle(source).slice(0, n).map((word) => {
    // typed mode is production practice: always English → type the Portuguese
    const dir = mode === 'typed' ? 'en-pt' : Math.random() < 0.5 ? 'pt-en' : 'en-pt'
    const answer = dir === 'pt-en' ? word.english : word.portuguese
    // distractors must be distinct from the answer AND from each other —
    // synonymous translations ("antes"/"antes de" → "before") otherwise
    // produce two identical options
    const texts = new Set([answer])
    const wrong = []
    for (const w of shuffle(pool.filter((x) => x.id !== word.id))) {
      const t = dir === 'pt-en' ? w.english : w.portuguese
      if (!t || texts.has(t)) continue
      texts.add(t)
      wrong.push(t)
      if (wrong.length === 3) break
    }
    return {
      word,
      dir,
      prompt: dir === 'pt-en' ? word.portuguese : word.english,
      options: shuffle([answer, ...wrong]),
      answer,
    }
  })
}

export default function Quiz({ words, reload }) {
  const [mode, setMode] = useState('choice') // choice | typed
  const [quiz, setQuiz] = useState(null)
  const [index, setIndex] = useState(0)
  const [picked, setPicked] = useState(null)
  const [typed, setTyped] = useState('')
  const [typedResult, setTypedResult] = useState(null) // {correct, accentMiss}
  const [score, setScore] = useState(0)
  const [finished, setFinished] = useState(false)

  const start = () => {
    setQuiz(buildQuiz(words, mode))
    setIndex(0)
    setPicked(null)
    setTyped('')
    setTypedResult(null)
    setScore(0)
    setFinished(false)
  }

  if (!quiz) {
    const ready = words.filter((w) => w.english).length >= 4
    return (
      <div>
        <h1>Quick quiz</h1>
        <div className="card">
          <p className="muted">
            Ten quick questions from the words you’re working on.
          </p>
          <label>Quiz style</label>
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="choice">Multiple choice (both directions)</option>
            <option value="typed">Type the Portuguese (harder — real recall)</option>
          </select>
          <button className="btn" onClick={start} disabled={!ready}>
            ▶ Start quiz
          </button>
          {!ready && <p className="muted small">You need at least 4 words with translations.</p>}
        </div>
      </div>
    )
  }

  if (finished) {
    return (
      <div>
        <h1>Quiz done!</h1>
        <div className="card" style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '2.4rem', margin: 8 }}>
            {score} / {quiz.length}
          </p>
          <p className="muted">
            {score === quiz.length
              ? 'Perfeito! 🏆'
              : score >= quiz.length * 0.7
                ? 'Muito bem! 💪'
                : 'Keep practicing — you’ll get there! 🌱'}
          </p>
          <button className="btn" onClick={start}>Another round</button>
        </div>
      </div>
    )
  }

  const q = quiz[index]
  const answered = mode === 'typed' ? typedResult !== null : picked !== null

  // Status effects: never demote a word the student hasn't started learning;
  // a correct answer on a brand-new word IS evidence they recognize it.
  const quizStatus = (word, correct) => {
    if (correct) return word.status === 'unknown' ? 'recognize' : null
    return word.status === 'unknown' ? null : 'trouble'
  }

  const pick = async (opt) => {
    if (answered) return
    setPicked(opt)
    const correct = opt === q.answer
    if (correct) setScore(score + 1)
    await store.recordReview(q.word.id, correct, quizStatus(q.word, correct))
  }

  const submitTyped = async () => {
    if (answered || !typed.trim()) return
    // Accent-insensitive match counts as correct — but we show the accents you
    // missed so you learn the real spelling.
    const exact = typed.trim().toLowerCase() === q.answer.toLowerCase()
    const correct = normalizePt(typed) === normalizePt(q.answer)
    setTypedResult({ correct, accentMiss: correct && !exact })
    if (correct) setScore(score + 1)
    await store.recordReview(q.word.id, correct, quizStatus(q.word, correct))
  }

  const next = () => {
    if (index + 1 >= quiz.length) {
      setFinished(true)
      reload()
    } else {
      setIndex(index + 1)
      setPicked(null)
      setTyped('')
      setTypedResult(null)
    }
  }

  return (
    <div>
      <div className="row">
        <span className="muted small">
          Question {index + 1} / {quiz.length}
        </span>
        <div className="grow progressbar" style={{ margin: 0 }}>
          <div style={{ width: (index / quiz.length) * 100 + '%' }} />
        </div>
      </div>
      <div className="card" style={{ textAlign: 'center' }}>
        <p className="muted small">
          {q.dir === 'pt-en' ? 'What does this mean?' : 'How do you say this in Portuguese?'}
        </p>
        <p style={{ fontSize: '1.6rem', fontWeight: 800, margin: '6px 0' }}>
          {q.prompt} {q.dir === 'pt-en' && <AudioButton text={q.prompt} />}
        </p>
      </div>

      {mode === 'choice' ? (
        <div>
          {q.options.map((opt) => (
            <button
              key={opt}
              className={
                'quiz-option ' +
                (answered && opt === q.answer ? 'correct' : answered && opt === picked ? 'wrong' : '')
              }
              onClick={() => pick(opt)}
            >
              {opt}
            </button>
          ))}
        </div>
      ) : (
        <div className="card">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              submitTyped()
            }}
          >
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Type it in Portuguese… (accents optional)"
              autoFocus
              autoComplete="off"
              autoCapitalize="off"
              disabled={answered}
            />
            {!answered && (
              <button className="btn" type="submit" disabled={!typed.trim()}>
                Check
              </button>
            )}
          </form>
          {typedResult && (
            <div className={'pron-result ' + (typedResult.correct ? 'pass' : 'fail')}>
              {typedResult.correct ? (
                typedResult.accentMiss ? (
                  <>✅ Right! Watch the accents though: <strong>{q.answer}</strong></>
                ) : (
                  <>✅ Correct — <strong>{q.answer}</strong></>
                )
              ) : (
                <>❌ It’s <strong>{q.answer}</strong> <AudioButton text={q.answer} /></>
              )}
            </div>
          )}
        </div>
      )}

      {answered && (
        <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={next}>
          {index + 1 >= quiz.length ? 'See results' : 'Next →'}
        </button>
      )}
    </div>
  )
}
