import React, { useEffect, useState } from 'react'
import * as store from '../lib/store.js'
import { STATUS_LABELS, STATUS_COLORS } from '../lib/store.js'

export default function Dashboard({ words, counts, profile, goTo, reload }) {
  const [activity, setActivity] = useState({})
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    store.getActivity().then(setActivity).catch(() => {})
  }, [words])

  const today = new Date().toISOString().slice(0, 10)
  const todayCount = activity[today] || 0
  const goal = profile?.settings?.dailyGoal || 20

  // streak: consecutive days ending today/yesterday with activity
  let streak = 0
  {
    const d = new Date()
    if (!activity[today]) d.setDate(d.getDate() - 1)
    for (;;) {
      const key = d.toISOString().slice(0, 10)
      if (activity[key]) {
        streak++
        d.setDate(d.getDate() - 1)
      } else break
    }
  }

  const installStarter = async () => {
    setInstalling(true)
    try {
      await store.installStarterPack()
      await reload()
    } finally {
      setInstalling(false)
    }
  }

  return (
    <div>
      <h1>Bem-vindo{profile?.display_name ? `, ${profile.display_name}` : ''}! 👋</h1>

      <div className="stat-grid">
        <div className="stat">
          <div className="n">{counts.total}</div>
          <div className="l">Total words</div>
        </div>
        <div className="stat">
          <div className="n" style={{ color: STATUS_COLORS.learned }}>{counts.learned}</div>
          <div className="l">Learned</div>
        </div>
        <div className="stat">
          <div className="n" style={{ color: STATUS_COLORS.learning }}>{counts.active}</div>
          <div className="l">In progress</div>
        </div>
        <div className="stat">
          <div className="n" style={{ color: STATUS_COLORS.recognize }}>{counts.recognize}</div>
          <div className="l">Recognize</div>
        </div>
        <div className="stat">
          <div className="n">🔥 {streak}</div>
          <div className="l">Day streak</div>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Today</h2>
        <p className="muted small">
          {todayCount} / {goal} cards reviewed today
        </p>
        <div className="progressbar">
          <div style={{ width: Math.min(100, (todayCount / goal) * 100) + '%' }} />
        </div>
        <div className="row">
          <button className="btn" onClick={() => goTo('study')}>▶ Study flashcards</button>
          <button className="btn secondary" onClick={() => goTo('quiz')}>Take a quiz</button>
          <button className="btn secondary" onClick={() => goTo('story')}>Read a story</button>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Your words by status</h2>
        {Object.keys(STATUS_LABELS).map((s) => (
          <div className="row" key={s} style={{ margin: '6px 0' }}>
            <span className="badge" style={{ background: STATUS_COLORS[s] }}>
              {STATUS_LABELS[s]}
            </span>
            <div className="grow progressbar" style={{ margin: 0 }}>
              <div
                style={{
                  width: counts.total ? (counts[s] / counts.total) * 100 + '%' : 0,
                  background: STATUS_COLORS[s],
                }}
              />
            </div>
            <span className="muted small" style={{ width: 44, textAlign: 'right' }}>{counts[s]}</span>
          </div>
        ))}
      </div>

      {counts.total === 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Get started</h2>
          <p className="muted">
            Your word list is empty. Install the starter pack of common Brazilian Portuguese words,
            or head to Import to load your own list.
          </p>
          <div className="row">
            <button className="btn" onClick={installStarter} disabled={installing}>
              {installing ? 'Installing…' : '📦 Install starter word pack'}
            </button>
            <button className="btn secondary" onClick={() => goTo('import')}>Import my list</button>
          </div>
        </div>
      )}
    </div>
  )
}
