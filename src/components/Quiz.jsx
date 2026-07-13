import React, { useState } from 'react'
import * as store from '../lib/store.js'
import AudioButton from './AudioButton.jsx'

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildQuiz(words, n = 10) {
  // quiz words you're working on first; fall back to anything with a translation
  const pool = words.filter((w) => w.english)
  const primary = pool.filter((w) => ['learning', 'trouble', 'recognize'].includes(w.status))
  const source = primary.length >= 4 ? primary : pool
  const questions = shuffle(source).slice(0, n).map((word) => {
    const dir = Math.random() < 0.5 ? 'pt-en' : 'en-pt'
    const wrong = shuffle(pool.filter((w) => w.id !== word.id))
      .slice(0, 3)
      .map((w) => (dir === 'pt-en' ? w.english : w.portuguese))
    const answer = dir === 'pt-en' ? word.english : word.portuguese
    return {
      word,
      dir,
      prompt: dir === 'pt-en' ? word.portuguese : word.english,
      options: shuffle([answer, ...wrong]),
      answer,
    }
  })
  return questions
}

export default function Quiz({ words, reload }) {
  const [quiz, setQuiz] = useState(null)
  const [index, setIndex] = useState(0)
  const [picked, setPicked] = useState(null)
  const [score, setScore] = useState(0)
  const [finished, setFinished] = useState(false)

  const start = () => {
    setQuiz(buildQuiz(words))
    setIndex(0)
    setPicked(null)
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
            Ten multiple-choice questions from the words you’re working on — both directions,
            Portuguese → English and English → Portuguese.
          </p>
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
  const answered = picked !== null

  const pick = async (opt) => {
    if (answered) return
    setPicked(opt)
    const correct = opt === q.answer
    if (correct) setScore(score + 1)
    await store.recordReview(q.word.id, correct, correct ? null : 'trouble')
  }

  const next = () => {
    if (index + 1 >= quiz.length) {
      setFinished(true)
      reload()
    } else {
      setIndex(index + 1)
      setPicked(null)
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
        <p className="muted small">{q.dir === 'pt-en' ? 'What does this mean?' : 'How do you say this in Portuguese?'}</p>
        <p style={{ fontSize: '1.6rem', fontWeight: 800, margin: '6px 0' }}>
          {q.prompt} {q.dir === 'pt-en' && <AudioButton text={q.prompt} />}
        </p>
      </div>
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
      {answered && (
        <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={next}>
          {index + 1 >= quiz.length ? 'See results' : 'Next →'}
        </button>
      )}
    </div>
  )
}
