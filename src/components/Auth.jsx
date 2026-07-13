import React, { useState } from 'react'
import * as store from '../lib/store.js'
import { saveConfig, getConfig } from '../lib/config.js'
import { resetSupabase } from '../lib/supabaseClient.js'

export default function Auth({ initialMode = 'signin', onSignedIn, onBack }) {
  const [mode, setMode] = useState(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [isTeacher, setIsTeacher] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [showConnect, setShowConnect] = useState(false)
  const [sbUrl, setSbUrl] = useState(getConfig().supabaseUrl)
  const [sbKey, setSbKey] = useState(getConfig().supabaseAnonKey)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (mode === 'signin') {
        await store.signIn(email, password)
      } else {
        await store.signUp(email, password, name, isTeacher ? 'teacher' : 'user')
        setNotice('Account created! If email confirmation is on, check your inbox, then sign in.')
        setMode('signin')
        setBusy(false)
        return
      }
      onSignedIn()
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setBusy(false)
    }
  }

  const saveConnection = () => {
    saveConfig({ supabaseUrl: sbUrl.trim(), supabaseAnonKey: sbKey.trim() })
    resetSupabase()
    window.location.reload()
  }

  return (
    <div className="auth-wrap">
      <div className="auth-logo">
        Fala<span>!</span> 🇧🇷
      </div>
      <p className="muted" style={{ textAlign: 'center' }}>
        Learn Brazilian Portuguese, one word at a time.
      </p>
      <div className="card">
        <form onSubmit={submit}>
          {mode === 'signup' && (
            <>
              <label>Your name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
            </>
          )}
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          {mode === 'signup' && (
            <label className="row" style={{ gap: 8, margin: '4px 0 10px' }}>
              <input
                type="checkbox"
                checked={isTeacher}
                onChange={(e) => setIsTeacher(e.target.checked)}
              />
              I'm a teacher — I'll manage students, assign homework, and share word lists
            </label>
          )}
          {error && <p className="error">{error}</p>}
          {notice && <p className="success">{notice}</p>}
          <button className="btn" style={{ width: '100%' }} disabled={busy}>
            {mode === 'signin' ? 'Sign in' : isTeacher ? 'Create teacher account' : 'Create account'}
          </button>
        </form>
        <p className="muted small" style={{ textAlign: 'center' }}>
          {mode === 'signin' ? (
            <>
              New here?{' '}
              <a href="#" onClick={(e) => { e.preventDefault(); setMode('signup') }}>
                Create an account
              </a>
            </>
          ) : (
            <>
              Have an account?{' '}
              <a href="#" onClick={(e) => { e.preventDefault(); setMode('signin') }}>
                Sign in
              </a>
            </>
          )}
        </p>
        {onBack && (
          <p className="muted small" style={{ textAlign: 'center' }}>
            <a href="#" onClick={(e) => { e.preventDefault(); onBack() }}>← Back to the front page</a>
          </p>
        )}
      </div>
      <p className="muted small" style={{ textAlign: 'center' }}>
        Students: after signing up, join your teacher's class with their code in{' '}
        <strong>Settings → My class</strong>.
      </p>
      <p className="muted small" style={{ textAlign: 'center' }}>
        <a href="#" onClick={(e) => { e.preventDefault(); setShowConnect(!showConnect) }}>
          Change Supabase connection
        </a>
      </p>
      {showConnect && (
        <div className="card">
          <label>Supabase project URL</label>
          <input type="url" value={sbUrl} onChange={(e) => setSbUrl(e.target.value)} placeholder="https://xxxx.supabase.co" />
          <label>Supabase anon (public) key</label>
          <input type="text" value={sbKey} onChange={(e) => setSbKey(e.target.value)} />
          <button className="btn small" onClick={saveConnection}>Save & reload</button>
        </div>
      )}
    </div>
  )
}
