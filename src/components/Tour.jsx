import React, { useEffect, useLayoutEffect, useState } from 'react'

// Guided tour: spotlights parts of the UI and explains what lives where.
// Runs automatically on first login; can be replayed from Settings.
const STEPS = (isTeacher) => [
  {
    title: 'Boas-vindas ao Fala! 👋',
    body: "Here's a 60-second walk-through of where everything lives. You can replay this anytime from Settings → Help & how-to.",
  },
  {
    selector: '[data-tour="tab-dashboard"]',
    title: 'Home',
    body: 'Your daily starting point: words due for review, your streak, homework from your teacher, the leaderboard, and a lesson to revisit.',
  },
  {
    selector: '[data-tour="tab-study"]',
    title: 'Flashcards',
    body: "The core of the app. Words you're learning come back right before you'd forget them. Flip a card, grade yourself honestly, and use the ℹ️ Info button for conjugations and examples.",
  },
  {
    selector: '[data-tour="tab-words"]',
    title: 'Words',
    body: 'Your entire word list. Search it, filter by status / category / date added, add words or phrases with pictures, and check your pronunciation with the 🎤 button.',
  },
  {
    selector: '[data-tour="tab-quiz"]',
    title: 'Quiz',
    body: 'Quick 10-question checks — multiple choice, or type-the-Portuguese for real recall practice.',
  },
  {
    selector: '[data-tour="tab-story"]',
    title: 'Stories',
    body: 'AI writes short stories using words you already know. Tap any word in a story to mark it recognized or add it to your list.',
  },
  {
    selector: '[data-tour="tab-lessons"]',
    title: 'Mini lessons',
    body: 'Your personal lesson library. Generate a lesson on anything — a tricky conjugation, phrases for the beach — and every lesson you save from the AI chat lands here too. Searchable forever.',
  },
  {
    selector: '[data-tour="tab-import"]',
    title: 'Import',
    body: 'The fastest way to load your vocabulary: paste your word list or a whole class document and AI extracts the words for you.',
  },
  ...(isTeacher
    ? [
        {
          selector: '[data-tour="tab-class"]',
          title: 'My Class',
          body: 'Teacher tools: share your class code, watch each student\'s progress, and assign homework with word lists attached.',
        },
      ]
    : []),
  {
    selector: '[data-tour="bell"]',
    title: 'Notifications',
    body: 'Homework, messages, and progress updates arrive here. They stay in the list after you read them, so you can always scroll back.',
  },
  {
    selector: '[data-tour="chat-fab"]',
    title: 'Your tutor, always here',
    body: 'This floating head is Zé. Ask the AI anything about Portuguese (it knows what page you\'re on), or switch tabs to message your teacher about the next class.',
  },
  {
    selector: '[data-tour="tab-settings"]',
    title: 'Settings',
    body: 'Profile picture, email & password, learning limits, daily reminders, your class code, data export — and the Help & how-to guide with this tour.',
  },
]

export default function Tour({ isTeacher, onDone }) {
  const steps = STEPS(isTeacher)
  const [i, setI] = useState(0)
  const [rect, setRect] = useState(null)
  const [tick, setTick] = useState(0) // bumped on resize to re-measure
  const step = steps[i]

  useLayoutEffect(() => {
    if (!step.selector) {
      setRect(null)
      return
    }
    const el = document.querySelector(step.selector)
    if (!el) {
      setRect(null)
      return
    }
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    const r = el.getBoundingClientRect()
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
  }, [i, step.selector, tick])

  useEffect(() => {
    const onResize = () => setTick((t) => t + 1)
    const onKey = (e) => e.key === 'Escape' && onDone()
    window.addEventListener('resize', onResize)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('keydown', onKey)
    }
  }, [onDone])

  const pad = 6
  const clampLeft = (left) => Math.max(12, Math.min(left, window.innerWidth - 342))
  const tipStyle = rect
    ? rect.top > window.innerHeight / 2
      ? { left: clampLeft(rect.left), bottom: window.innerHeight - rect.top + 12 }
      : { left: clampLeft(rect.left), top: rect.top + rect.height + 12 }
    : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }

  return (
    <div className="tour-overlay">
      {rect ? (
        <div
          className="tour-spotlight"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
          }}
        />
      ) : (
        <div className="tour-dim" />
      )}
      <div className="tour-tip" style={tipStyle}>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
        <div className="tour-dots" style={{ marginBottom: 10 }}>
          {steps.map((_, j) => (
            <span key={j} className={j === i ? 'on' : ''} />
          ))}
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn ghost small" onClick={onDone}>
            Skip
          </button>
          {i > 0 && (
            <button className="btn secondary small" onClick={() => setI(i - 1)}>
              Back
            </button>
          )}
          <button
            className="btn small"
            onClick={() => (i + 1 >= steps.length ? onDone() : setI(i + 1))}
          >
            {i + 1 >= steps.length ? 'Done ✔' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  )
}
