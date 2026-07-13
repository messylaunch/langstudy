import React, { useEffect, useMemo, useState, useCallback } from 'react'
import * as store from './lib/store.js'
import { startReminderLoop } from './lib/notify.js'
import Auth from './components/Auth.jsx'
import Dashboard from './components/Dashboard.jsx'
import WordList from './components/WordList.jsx'
import Flashcards from './components/Flashcards.jsx'
import Quiz from './components/Quiz.jsx'
import Story from './components/Story.jsx'
import ImportWords from './components/ImportWords.jsx'
import Settings from './components/Settings.jsx'
import Admin from './components/Admin.jsx'

const TABS = [
  ['dashboard', 'Home'],
  ['study', 'Flashcards'],
  ['words', 'Words'],
  ['quiz', 'Quiz'],
  ['story', 'Stories'],
  ['import', 'Import'],
  ['settings', 'Settings'],
]

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = loading
  const [profile, setProfile] = useState(null)
  const [words, setWords] = useState([])
  const [tab, setTab] = useState('dashboard')
  const [loading, setLoading] = useState(true)

  const refreshSession = useCallback(async () => {
    try {
      const s = await store.getSession()
      setSession(s || null)
    } catch {
      setSession(null)
    }
  }, [])

  useEffect(() => {
    refreshSession()
    const off = store.onAuthChange(refreshSession)
    return off
  }, [refreshSession])

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [p, w] = await Promise.all([store.getProfile(), store.listWords()])
      setProfile(p)
      setWords(w)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (session) reload()
  }, [session, reload])

  // daily reminder loop
  useEffect(() => {
    if (!profile) return
    const stop = startReminderLoop(
      () => profile.settings,
      () => {
        const today = new Date().toISOString().slice(0, 10)
        return words.some((w) => w.last_reviewed && w.last_reviewed.slice(0, 10) === today)
      }
    )
    return stop
  }, [profile, words])

  const counts = useMemo(() => {
    const c = { total: words.length }
    for (const s of store.STATUSES) c[s] = 0
    for (const w of words) c[w.status] = (c[w.status] || 0) + 1
    c.active = c.learning + c.trouble
    return c
  }, [words])

  if (session === undefined) {
    return <div className="auth-wrap"><p className="muted">Loading…</p></div>
  }

  if (!session) {
    return <Auth onSignedIn={refreshSession} />
  }

  const isMaster = profile?.role === 'master'
  const tabs = isMaster ? [...TABS, ['admin', 'Admin']] : TABS

  return (
    <div className="app">
      <header className="topbar">
        <div className="logo">Fala<span>!</span> 🇧🇷</div>
        <div className="spacer" />
        <div className="who">
          {profile?.display_name || profile?.email}
          {isMaster ? ' · master' : ''}
          {store.mode() === 'local' ? ' · local demo' : ''}
        </div>
        {store.mode() === 'supabase' && (
          <button onClick={() => store.signOut()}>Sign out</button>
        )}
      </header>
      <nav className="nav">
        {tabs.map(([id, label]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>
      <main>
        {/* Only block rendering on the very first load — background reloads
            must not unmount views (that would wipe in-progress sessions). */}
        {loading && !profile && <p className="muted">Loading your words…</p>}
        {profile && tab === 'dashboard' && (
          <Dashboard words={words} counts={counts} profile={profile} goTo={setTab} reload={reload} />
        )}
        {profile && tab === 'words' && <WordList words={words} reload={reload} profile={profile} />}
        {profile && tab === 'study' && (
          <Flashcards words={words} profile={profile} counts={counts} reload={reload} />
        )}
        {profile && tab === 'quiz' && <Quiz words={words} reload={reload} />}
        {profile && tab === 'story' && <Story words={words} reload={reload} />}
        {profile && tab === 'import' && <ImportWords reload={reload} goTo={setTab} />}
        {profile && tab === 'settings' && (
          <Settings profile={profile} counts={counts} onSaved={reload} />
        )}
        {profile && tab === 'admin' && isMaster && <Admin />}
      </main>
    </div>
  )
}
