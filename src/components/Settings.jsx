import React, { useState } from 'react'
import * as store from '../lib/store.js'
import { getConfig, saveConfig } from '../lib/config.js'
import { resetSupabase } from '../lib/supabaseClient.js'
import { requestPermission, enablePeriodicSync } from '../lib/notify.js'

export default function Settings({ profile, counts, onSaved, onReplayTour }) {
  const s = profile?.settings || store.DEFAULT_SETTINGS
  const [displayName, setDisplayName] = useState(profile?.display_name || '')
  const [learningLimit, setLearningLimit] = useState(s.learningLimit)
  const [newPerSession, setNewPerSession] = useState(s.newPerSession)
  const [dailyGoal, setDailyGoal] = useState(s.dailyGoal)
  const [remindersEnabled, setRemindersEnabled] = useState(s.remindersEnabled)
  const [reminderTime, setReminderTime] = useState(s.reminderTime)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const cfg = getConfig()
  const [sbUrl, setSbUrl] = useState(cfg.supabaseUrl)
  const [sbKey, setSbKey] = useState(cfg.supabaseAnonKey)
  const [aiKey, setAiKey] = useState(cfg.anthropicApiKey)

  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [accountMsg, setAccountMsg] = useState('')
  const [classCode, setClassCode] = useState('')
  const [classMsg, setClassMsg] = useState('')

  const onAvatarFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const url = await store.uploadAvatar(file)
      setAvatarUrl(url)
      onSaved()
    } catch (err) {
      setAccountMsg('⚠ ' + err.message)
    }
  }

  const save = async () => {
    setError('')
    try {
      if (remindersEnabled) {
        const perm = await requestPermission()
        if (perm !== 'granted') {
          setError('Notifications were not allowed by the browser — reminders will stay off.')
        } else {
          enablePeriodicSync()
        }
      }
      await store.saveSettings({
        learningLimit: Number(learningLimit) || 20,
        newPerSession: Number(newPerSession) || 10,
        dailyGoal: Number(dailyGoal) || 20,
        remindersEnabled,
        reminderTime,
      })
      if (displayName !== profile?.display_name) await store.updateDisplayName(displayName)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      onSaved()
    } catch (e) {
      setError(e.message)
    }
  }

  const exportCsv = async () => {
    const words = await store.listWords()
    const esc = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"'
    const rows = [
      ['portuguese', 'english', 'pos', 'category', 'status', 'notes', 'created_at'].join(','),
      ...words.map((w) =>
        [w.portuguese, w.english, w.pos, w.category, w.status, w.notes, w.created_at].map(esc).join(',')
      ),
    ]
    const blob = new Blob(['\ufeff' + rows.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'fala-words-' + new Date().toISOString().slice(0, 10) + '.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const saveConnection = () => {
    saveConfig({
      supabaseUrl: sbUrl.trim(),
      supabaseAnonKey: sbKey.trim(),
      anthropicApiKey: aiKey.trim(),
    })
    resetSupabase()
    window.location.reload()
  }

  return (
    <div>
      <h1>Settings</h1>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Profile</h2>
        <div className="row" style={{ marginBottom: 10 }}>
          {avatarUrl ? (
            <img className="avatar-lg" src={avatarUrl} alt="Your profile picture" />
          ) : (
            <span style={{ fontSize: '2.6rem' }}>🧑‍🎓</span>
          )}
          <div className="grow">
            <label>Profile picture</label>
            <input type="file" accept="image/*" onChange={onAvatarFile} />
          </div>
        </div>
        <label>Display name</label>
        <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <p className="muted small">
          Signed in as {profile?.email} · role: <strong>{profile?.role}</strong>
          {store.mode() === 'local' && ' · local demo mode (data stays on this device)'}
        </p>
      </div>

      {store.mode() === 'supabase' && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Account</h2>
          <label>Change email</label>
          <div className="row">
            <input
              type="email"
              className="grow"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder={profile?.email}
            />
            <button
              className="btn secondary small"
              disabled={!newEmail.trim()}
              onClick={async () => {
                try {
                  await store.updateEmail(newEmail.trim())
                  setAccountMsg('Email change requested — check both inboxes to confirm.')
                  setNewEmail('')
                } catch (e) {
                  setAccountMsg('⚠ ' + e.message)
                }
              }}
            >
              Update
            </button>
          </div>
          <label>Change password</label>
          <div className="row">
            <input
              type="password"
              className="grow"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password (min 6 characters)"
            />
            <button
              className="btn secondary small"
              disabled={newPassword.length < 6}
              onClick={async () => {
                try {
                  await store.updatePassword(newPassword)
                  setAccountMsg('Password updated ✔')
                  setNewPassword('')
                } catch (e) {
                  setAccountMsg('⚠ ' + e.message)
                }
              }}
            >
              Update
            </button>
          </div>
          {accountMsg && <p className={accountMsg.startsWith('⚠') ? 'error' : 'success'}>{accountMsg}</p>}
        </div>
      )}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>My class</h2>
        {store.isTeacherRole(profile) ? (
          <>
            <p className="muted small">
              You're a {profile.role}. Your class code — share it with students so they can join:
            </p>
            <p style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: 3, color: 'var(--green-dark)', margin: '4px 0' }}>
              {profile?.teacher_code || '—'}
            </p>
            <p className="muted small">Manage students and homework in the My Class tab.</p>
          </>
        ) : profile?.teacher_id ? (
          <>
            <p className="muted small">You're in a class ✔ — your teacher can see your progress and send you homework.</p>
            <button
              className="btn ghost small"
              onClick={async () => {
                if (!confirm('Leave your class? Your teacher will no longer see your progress.')) return
                await store.leaveClass()
                onSaved()
              }}
            >
              Leave class
            </button>
          </>
        ) : (
          <>
            <p className="muted small">
              Have a teacher? Enter their class code and they'll be able to follow your progress,
              assign homework, and chat with you.
            </p>
            <div className="row">
              <input
                type="text"
                className="grow"
                value={classCode}
                onChange={(e) => setClassCode(e.target.value.toUpperCase())}
                placeholder="Class code, e.g. 4F7A2C"
                maxLength={8}
              />
              <button
                className="btn small"
                disabled={classCode.trim().length < 4}
                onClick={async () => {
                  try {
                    const teacherName = await store.joinClass(classCode)
                    setClassMsg(`Joined ${teacherName}'s class ✔`)
                    setClassCode('')
                    onSaved()
                  } catch (e) {
                    setClassMsg('⚠ ' + e.message)
                  }
                }}
              >
                Join
              </button>
            </div>
            {classMsg && <p className={classMsg.startsWith('⚠') ? 'error' : 'success'}>{classMsg}</p>}
            {store.mode() === 'local' && (
              <p className="muted small">Classes need the Supabase backend.</p>
            )}
          </>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Help & how-to</h2>
        <button className="btn secondary small" onClick={onReplayTour}>
          🔄 Replay the app tour
        </button>
        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Quick how-to guide</summary>
          <ul className="muted small" style={{ lineHeight: 1.7 }}>
            <li><strong>Home</strong> — words due today, homework, streak, leaderboard, a lesson to revisit.</li>
            <li><strong>Flashcards</strong> — daily studying. Flip, grade yourself, use ℹ️ Info for conjugations & examples, 🎤 to check pronunciation.</li>
            <li><strong>Words</strong> — your whole list. Search, filter by status/category/date, add words with pictures.</li>
            <li><strong>Quiz</strong> — 10 quick questions; try "type the Portuguese" for real recall.</li>
            <li><strong>Stories</strong> — AI stories from words you know; tap words to add them.</li>
            <li><strong>Lessons</strong> — generate mini lessons on anything; answers you save from the chat land here. Searchable.</li>
            <li><strong>Import</strong> — paste your word list or a class document (AI extracts the vocabulary).</li>
            <li><strong>Chat head (bottom right)</strong> — ask Zé the AI about Portuguese, or message your teacher.</li>
            <li><strong>Statuses</strong> — Don't know → Learning → Recognize → Learned, with Trouble remembering for the hard ones. Reviewed words come back before you'd forget them.</li>
            <li><strong>Learning limit</strong> — caps how many words are "in progress" so you never drown.</li>
          </ul>
        </details>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Learning</h2>
        <label>Learning limit — max words "in progress" at once</label>
        <input
          type="number"
          min="1"
          max="200"
          value={learningLimit}
          onChange={(e) => setLearningLimit(e.target.value)}
        />
        <p className="muted small">
          You currently have {counts?.active ?? 0} words in progress. New words stop being introduced
          when you hit the limit, so you never take on too much at once.
        </p>
        <label>New words per study session</label>
        <input
          type="number"
          min="0"
          max="50"
          value={newPerSession}
          onChange={(e) => setNewPerSession(e.target.value)}
        />
        <label>Daily goal (cards per day)</label>
        <input type="number" min="1" max="500" value={dailyGoal} onChange={(e) => setDailyGoal(e.target.value)} />
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Daily reminder</h2>
        <label className="row" style={{ gap: 8 }}>
          <input
            type="checkbox"
            checked={remindersEnabled}
            onChange={(e) => setRemindersEnabled(e.target.checked)}
          />
          Remind me to study every day
        </label>
        <label>Reminder time</label>
        <input type="time" value={reminderTime} onChange={(e) => setReminderTime(e.target.value)} />
        <p className="muted small">
          Reminders fire while the app (or the installed app window) is open; on Android with the
          installed PWA they can also fire in the background.
        </p>
      </div>

      {error && <p className="error">{error}</p>}
      {saved && <p className="success">Saved ✔</p>}
      <button className="btn" onClick={save}>Save settings</button>

      <div className="card" style={{ marginTop: 22 }}>
        <h2 style={{ marginTop: 0 }}>Connections</h2>
        <label>Supabase project URL</label>
        <input
          type="url"
          value={sbUrl}
          onChange={(e) => setSbUrl(e.target.value)}
          placeholder="https://xxxx.supabase.co"
        />
        <label>Supabase anon (public) key</label>
        <input type="text" value={sbKey} onChange={(e) => setSbKey(e.target.value)} />
        <p className="muted small">
          Without Supabase the app runs in local demo mode — everything works but data stays on this
          device only. See the README for the 10-minute Supabase setup.
        </p>
        <label>Anthropic API key (optional)</label>
        <input
          type="password"
          value={aiKey}
          onChange={(e) => setAiKey(e.target.value)}
          placeholder="sk-ant-…"
        />
        <p className="muted small">
          Only needed if you want AI features (word info, stories, document import) without
          deploying the Supabase edge functions. The key is stored only in this browser.
        </p>
        <button className="btn secondary" onClick={saveConnection}>Save connections & reload</button>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Your data</h2>
        <p className="muted small">
          Your word list is yours — download it anytime as a CSV you can re-import here or open in
          a spreadsheet.
        </p>
        <button className="btn secondary small" onClick={exportCsv}>
          ⬇ Export my words (CSV)
        </button>
      </div>

      {store.mode() === 'local' && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Local data</h2>
          <button
            className="btn danger small"
            onClick={async () => {
              if (confirm('Reset all local demo data? This cannot be undone.')) {
                await store.resetLocalData()
                window.location.reload()
              }
            }}
          >
            Reset local demo data
          </button>
        </div>
      )}
    </div>
  )
}
