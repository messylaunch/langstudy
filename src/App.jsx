import React, { useEffect, useMemo, useState, useCallback } from 'react'
import * as store from './lib/store.js'
import { startReminderLoop } from './lib/notify.js'
import Auth from './components/Auth.jsx'
import Landing from './components/Landing.jsx'
import Tour from './components/Tour.jsx'
import Dashboard from './components/Dashboard.jsx'
import WordList from './components/WordList.jsx'
import Flashcards from './components/Flashcards.jsx'
import Quiz from './components/Quiz.jsx'
import Story from './components/Story.jsx'
import Lessons from './components/Lessons.jsx'
import ImportWords from './components/ImportWords.jsx'
import Settings from './components/Settings.jsx'
import Admin from './components/Admin.jsx'
import TeacherClass from './components/TeacherClass.jsx'
import ChatWidget from './components/ChatWidget.jsx'
import NotificationsBell from './components/NotificationsBell.jsx'

const TABS = [
  ['dashboard', 'Home'],
  ['study', 'Flashcards'],
  ['words', 'Words'],
  ['quiz', 'Quiz'],
  ['story', 'Stories'],
  ['lessons', 'Lessons'],
  ['import', 'Import'],
  ['settings', 'Settings'],
]

const LS_ENTERED = 'fala.entered' // local-mode "signed in" flag
const LS_TOUR = 'fala.tourDone'

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = loading
  const [entered, setEntered] = useState(localStorage.getItem(LS_ENTERED) === '1')
  const [authMode, setAuthMode] = useState(null) // null = landing; 'signin'|'signup' = auth screen
  const [profile, setProfile] = useState(null)
  const [words, setWords] = useState([])
  const [tab, setTab] = useState('dashboard')
  const [loading, setLoading] = useState(true)
  const [showTour, setShowTour] = useState(false)
  const [lessonSeed, setLessonSeed] = useState('')

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

  const signedIn = Boolean(session) && (store.mode() === 'supabase' || entered)

  useEffect(() => {
    if (signedIn) {
      reload()
      if (localStorage.getItem(LS_TOUR) !== '1') {
        // let the UI paint first so tour targets exist
        setTimeout(() => setShowTour(true), 600)
      }
    }
  }, [signedIn, reload])

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

  const finishTour = () => {
    localStorage.setItem(LS_TOUR, '1')
    setShowTour(false)
  }

  const requestLesson = (topic) => {
    setLessonSeed(topic)
    setTab('lessons')
  }

  if (session === undefined) {
    return <div className="auth-wrap"><p className="muted">Loading…</p></div>
  }

  // ------------------------------------------------- public front-end (out)
  if (!signedIn) {
    if (authMode && store.mode() === 'supabase') {
      return (
        <Auth
          initialMode={authMode}
          onSignedIn={refreshSession}
          onBack={() => setAuthMode(null)}
        />
      )
    }
    return (
      <Landing
        onSignIn={(m) => {
          if (store.mode() === 'supabase') setAuthMode(m)
          else alert('Connect Supabase first (see README) to create accounts — or use "continue on this device" below.')
        }}
        onLocalEnter={() => {
          localStorage.setItem(LS_ENTERED, '1')
          setEntered(true)
        }}
      />
    )
  }

  // --------------------------------------------------------- signed-in app
  const isMaster = profile?.role === 'master'
  const isTeacher = store.isTeacherRole(profile)
  const tabs = [...TABS]
  if (isTeacher) tabs.splice(7, 0, ['class', 'My Class'])
  if (isMaster) tabs.push(['admin', 'Admin'])

  return (
    <div className="app">
      <header className="topbar">
        <div className="logo">Fala<span>!</span> 🇧🇷</div>
        <div className="spacer" />
        <NotificationsBell />
        {profile?.avatar_url && <img className="avatar" src={profile.avatar_url} alt="" />}
        <div className="who">
          {profile?.display_name || profile?.email}
          {isMaster ? ' · master' : isTeacher ? ' · teacher' : ''}
          {store.mode() === 'local' ? ' · local' : ''}
        </div>
        <button
          onClick={async () => {
            if (store.mode() === 'supabase') await store.signOut()
            localStorage.removeItem(LS_ENTERED)
            setEntered(false)
            setProfile(null)
          }}
        >
          Sign out
        </button>
      </header>
      <nav className="nav">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            data-tour={'tab-' + id}
            className={tab === id ? 'active' : ''}
            onClick={() => setTab(id)}
          >
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
        {profile && tab === 'words' && (
          <WordList words={words} reload={reload} profile={profile} onLesson={requestLesson} />
        )}
        {profile && tab === 'study' && (
          <Flashcards
            words={words}
            profile={profile}
            counts={counts}
            reload={reload}
            onLesson={requestLesson}
          />
        )}
        {profile && tab === 'quiz' && <Quiz words={words} reload={reload} />}
        {profile && tab === 'story' && <Story words={words} reload={reload} />}
        {profile && tab === 'lessons' && (
          <Lessons seedTopic={lessonSeed} onSeedConsumed={() => setLessonSeed('')} />
        )}
        {profile && tab === 'import' && <ImportWords reload={reload} goTo={setTab} />}
        {profile && tab === 'settings' && (
          <Settings
            profile={profile}
            counts={counts}
            onSaved={reload}
            onReplayTour={() => setShowTour(true)}
          />
        )}
        {profile && tab === 'class' && isTeacher && <TeacherClass profile={profile} />}
        {profile && tab === 'admin' && isMaster && <Admin />}
      </main>

      {profile && <ChatWidget profile={profile} page={tab} />}
      {showTour && profile && <Tour isTeacher={isTeacher} onDone={finishTour} />}
    </div>
  )
}
