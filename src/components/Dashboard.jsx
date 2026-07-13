import React, { useEffect, useState } from 'react'
import * as store from '../lib/store.js'
import { STATUS_LABELS, STATUS_COLORS } from '../lib/store.js'
import { LessonView } from './Lessons.jsx'

export default function Dashboard({ words, counts, profile, goTo, reload }) {
  const [activity, setActivity] = useState({})
  const [installing, setInstalling] = useState(false)
  const [homework, setHomework] = useState([])
  const [hwBusy, setHwBusy] = useState(false)
  const [leaders, setLeaders] = useState([])
  const [spark, setSpark] = useState(null) // random lesson to revisit
  const [showSpark, setShowSpark] = useState(false)

  useEffect(() => {
    store.getActivity().then(setActivity).catch(() => {})
  }, [words])

  useEffect(() => {
    if (store.mode() === 'supabase' && !store.isTeacherRole(profile)) {
      store.listAssignmentsAsStudent().then(setHomework).catch(() => {})
    }
    store.getLeaderboard().then(setLeaders).catch(() => {})
    store.listLessons().then((ls) => {
      if (ls.length) setSpark(ls[Math.floor(Math.random() * ls.length)])
    }).catch(() => {})
  }, [profile])

  const today = store.localDay()
  const todayCount = activity[today] || 0
  const goal = profile?.settings?.dailyGoal || 20
  const dueCount = words.filter((w) => w.status !== 'unknown' && store.isDue(w)).length

  // streak: consecutive days ending today/yesterday with activity
  let streak = 0
  {
    const d = new Date()
    if (!activity[today]) d.setDate(d.getDate() - 1)
    for (;;) {
      const key = store.localDay(d)
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

  const openHomework = homework.filter((h) => !h.my?.completed_at)

  return (
    <div>
      <h1>Boas-vindas{profile?.display_name ? `, ${profile.display_name}` : ''}! 👋</h1>

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
          <div className="n" style={{ color: dueCount ? STATUS_COLORS.trouble : undefined }}>{dueCount}</div>
          <div className="l">Due for review</div>
        </div>
        <div className="stat">
          <div className="n">🔥 {streak}</div>
          <div className="l">Day streak</div>
        </div>
      </div>

      {openHomework.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid var(--orange)' }}>
          <h2 style={{ marginTop: 0 }}>📚 Homework from your teacher</h2>
          {openHomework.map((h) => (
            <div key={h.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
              <div className="pt">
                {h.title} {h.due_date && <span className="muted small">due {h.due_date}</span>}
              </div>
              {h.instructions && <div className="muted small">{h.instructions}</div>}
              <div className="row" style={{ marginTop: 8 }}>
                {(h.words || []).length > 0 && !h.my?.words_added_at && (
                  <button
                    className="btn small"
                    disabled={hwBusy}
                    onClick={async () => {
                      setHwBusy(true)
                      try {
                        await store.acceptAssignmentWords(h)
                        await reload()
                        setHomework(await store.listAssignmentsAsStudent())
                      } finally {
                        setHwBusy(false)
                      }
                    }}
                  >
                    ＋ Add {(h.words || []).length} words & start
                  </button>
                )}
                {h.my?.words_added_at && (
                  <span className="muted small">Words added ✔ — study them in Flashcards</span>
                )}
                <button
                  className="btn secondary small"
                  disabled={hwBusy}
                  onClick={async () => {
                    setHwBusy(true)
                    try {
                      await store.completeAssignment(h)
                      setHomework(await store.listAssignmentsAsStudent())
                    } finally {
                      setHwBusy(false)
                    }
                  }}
                >
                  Mark complete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Today</h2>
        <p className="muted small">
          {todayCount} / {goal} cards reviewed today
        </p>
        <div className="progressbar">
          <div style={{ width: Math.min(100, (todayCount / goal) * 100) + '%' }} />
        </div>
        <div className="row">
          <button className="btn" onClick={() => goTo('study')}>
            ▶ Study flashcards{dueCount ? ` (${dueCount} due)` : ''}
          </button>
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

      {leaders.length > 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>🏆 Leaderboard</h2>
          {leaders.slice(0, 10).map((u, i) => (
            <div className="word-row" key={u.id}>
              <span style={{ width: 26, fontWeight: 800 }}>
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
              </span>
              {u.avatar_url ? (
                <img className="avatar" src={u.avatar_url} alt="" />
              ) : (
                <span style={{ fontSize: '1.2rem' }}>🧑‍🎓</span>
              )}
              <div className="grow">
                <span className={u.id === profile?.id ? 'pt' : ''}>
                  {u.display_name}
                  {u.id === profile?.id ? ' (you)' : ''}
                </span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <strong>{u.points}</strong> <span className="muted small">pts</span>
                <div className="muted small">{u.learned} learned</div>
              </div>
            </div>
          ))}
          <p className="muted small">Points = words learned × 10 + cards reviewed.</p>
        </div>
      )}

      {spark && (
        <div className="card" style={{ borderLeft: '4px solid var(--yellow)' }}>
          <div className="row">
            <h2 style={{ margin: 0 }} className="grow">💡 Revisit a lesson</h2>
            <button className="btn ghost small" onClick={() => setShowSpark(!showSpark)}>
              {showSpark ? 'Hide' : 'Open'}
            </button>
          </div>
          <p className="muted small" style={{ marginBottom: 0 }}>{spark.title}</p>
          {showSpark && <LessonView lesson={spark} />}
        </div>
      )}

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
