import React, { useState } from 'react'
import * as store from '../lib/store.js'
import { getConfig, saveConfig } from '../lib/config.js'
import { resetSupabase } from '../lib/supabaseClient.js'
import { requestPermission, enablePeriodicSync } from '../lib/notify.js'

export default function Settings({ profile, counts, onSaved }) {
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
        <label>Display name</label>
        <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <p className="muted small">
          Signed in as {profile?.email} · role: <strong>{profile?.role}</strong>
          {store.mode() === 'local' && ' · local demo mode (data stays on this device)'}
        </p>
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
