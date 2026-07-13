import React, { useState } from 'react'
import { hasSupabase } from '../lib/config.js'
import { pressable } from '../lib/a11y.js'

// Sample cards for the front-page demo — hardcoded, nothing is saved.
const DEMO_CARDS = [
  { pt: 'saudade', en: 'that feeling of missing someone or something', tip: 'The famous "untranslatable" word.' },
  { pt: 'tudo bem?', en: "how's it going? / all good?", tip: 'The greeting you will use every single day.' },
  { pt: 'a gente', en: 'we (informal)', tip: 'Brazilians say this more than "nós".' },
]

function DemoFlashcard() {
  const [i, setI] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [message, setMessage] = useState('')
  const card = DEMO_CARDS[i % DEMO_CARDS.length]

  const grade = (label) => {
    setMessage(
      label === 'Easy'
        ? '✅ In the real app this word would move to your "Learned" pile and come back in 14 days.'
        : label === 'Again'
          ? '🔁 In the real app this word would go to "Trouble remembering" and come right back.'
          : `👍 In the real app this word would move to "${label === 'Good' ? 'Recognize' : 'Learning'}".`
    )
    setTimeout(() => {
      setMessage('')
      setFlipped(false)
      setI(i + 1)
    }, 1600)
  }

  return (
    <div>
      <div
        className="flashcard"
        style={{ minHeight: 220 }}
        onClick={() => setFlipped(!flipped)}
        {...pressable(() => setFlipped(!flipped))}
        aria-label="Demo flashcard, activate to flip"
      >
        {!flipped ? (
          <>
            <div className="front-word">{card.pt}</div>
            <div className="hint">tap the card to flip it</div>
          </>
        ) : (
          <>
            <div className="front-word" style={{ fontSize: '1.5rem' }}>{card.pt}</div>
            <div className="back-word" style={{ fontSize: '1.1rem' }}>{card.en}</div>
            <p className="muted small">{card.tip}</p>
            <div className="hint">now grade yourself below</div>
          </>
        )}
      </div>
      {flipped && !message && (
        <div className="grade-row">
          {[
            ['Again', '#c2403a'],
            ['Hard', '#d98510'],
            ['Good', '#2b6cb0'],
            ['Easy', '#0e7a4d'],
          ].map(([label, color]) => (
            <button key={label} style={{ background: color }} onClick={() => grade(label)}>
              {label}
            </button>
          ))}
        </div>
      )}
      {message && <p className="success" style={{ textAlign: 'center' }}>{message}</p>}
    </div>
  )
}

export default function Landing({ onSignIn, onLocalEnter }) {
  return (
    <div className="landing">
      <div className="landing-hero">
        <div style={{ fontSize: '2.6rem' }}>🇧🇷</div>
        <h1>
          Fala<span>!</span>
        </h1>
        <p>
          Your Brazilian Portuguese workbook. Bring the words from your classes, drill them with
          smart flashcards, and actually keep them — with audio, pronunciation checks, AI mini
          lessons, and your teacher right inside the app.
        </p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn cta" onClick={() => onSignIn('signup')}>
            Create your account
          </button>
          <button className="btn ghost-light" onClick={() => onSignIn('signin')}>
            Sign in
          </button>
        </div>
      </div>

      <div className="demo-wrap">
        <div className="card">
          <p className="muted small" style={{ textAlign: 'center', marginTop: 0 }}>
            👇 Try a flashcard right now
          </p>
          <DemoFlashcard />
        </div>
      </div>

      <div className="landing-section">
        <h2>Everything a vocabulary student needs</h2>
        <div className="feature-grid">
          <div className="feature">
            <div className="emoji">📋</div>
            <h3>Your word list, your pace</h3>
            <p>
              Import 2,000 words from a spreadsheet or paste class notes — AI pulls out the
              vocabulary. A learning limit keeps you from taking on too much at once.
            </p>
          </div>
          <div className="feature">
            <div className="emoji">🗂️</div>
            <h3>Smart flashcards</h3>
            <p>
              Words move through Don't know → Learning → Recognize → Learned, and come back for
              review before you forget them.
            </p>
          </div>
          <div className="feature">
            <div className="emoji">🔈</div>
            <h3>Hear it & say it</h3>
            <p>
              Brazilian pronunciation on every card, plus a mic check that scores how you say it.
            </p>
          </div>
          <div className="feature">
            <div className="emoji">🧑‍🏫</div>
            <h3>Built for classes</h3>
            <p>
              Join your teacher's class with a code. They see your progress, assign homework, and
              answer questions in the chat.
            </p>
          </div>
          <div className="feature">
            <div className="emoji">✨</div>
            <h3>AI tutor & mini lessons</h3>
            <p>
              Ask anything, any time. Generate a mini lesson on a conjugation or phrase set, and
              keep every lesson in your searchable library.
            </p>
          </div>
          <div className="feature">
            <div className="emoji">🏆</div>
            <h3>Stories, quizzes & leaderboard</h3>
            <p>
              Read AI stories built from words you know, quiz yourself both directions, and see how
              you stack up against classmates.
            </p>
          </div>
        </div>
      </div>

      <div className="landing-footer">
        <button className="btn cta" style={{ background: 'var(--green)', color: '#fff' }} onClick={() => onSignIn('signup')}>
          Start learning — it's free
        </button>
        {!hasSupabase() && (
          <p className="muted small" style={{ marginTop: 14 }}>
            No backend connected yet —{' '}
            <a href="#" onClick={(e) => { e.preventDefault(); onLocalEnter() }}>
              continue on this device without an account
            </a>{' '}
            (for trying the app before Supabase is set up).
          </p>
        )}
      </div>
    </div>
  )
}
