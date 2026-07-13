import React, { useEffect, useRef, useState } from 'react'
import * as store from '../lib/store.js'
import { askTutor, aiAvailable } from '../lib/ai.js'
import { getCurrentWord } from '../lib/uiContext.js'

const PAGE_NAMES = {
  dashboard: 'Home dashboard',
  study: 'Flashcards',
  words: 'Word list',
  quiz: 'Quiz',
  story: 'Stories',
  lessons: 'Mini lessons',
  import: 'Import',
  settings: 'Settings',
  class: 'My Class',
  admin: 'Admin',
}

// Floating chat head: ask the AI tutor (page-aware) or message your teacher.
export default function ChatWidget({ profile, page, onLessonSaved }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('ai') // ai | teacher
  const [aiMessages, setAiMessages] = useState([])
  const [aiBusy, setAiBusy] = useState(false)
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [thread, setThread] = useState([])
  const [students, setStudents] = useState([])
  const [chatWith, setChatWith] = useState(null) // other party {id, name}
  const [savedIdx, setSavedIdx] = useState({})
  const bodyRef = useRef(null)

  const isTeacher = store.isTeacherRole(profile)
  const hasTeacher = Boolean(profile?.teacher_id)
  const teacherTabAvailable = store.mode() === 'supabase' && (isTeacher || hasTeacher)

  // resolve who the "teacher" tab talks to
  useEffect(() => {
    if (!open || tab !== 'teacher' || !teacherTabAvailable) return
    if (isTeacher) {
      store.listMyStudents().then((s) => {
        setStudents(s)
        if (s.length && !chatWith) setChatWith({ id: s[0].id, name: s[0].display_name || s[0].email })
      })
    } else if (hasTeacher) {
      setChatWith({ id: profile.teacher_id, name: 'your teacher' })
    }
  }, [open, tab]) // eslint-disable-line react-hooks/exhaustive-deps

  // poll the message thread while it's visible
  useEffect(() => {
    if (!open || tab !== 'teacher' || !chatWith) return
    let alive = true
    const load = async () => {
      const msgs = await store.listMessages(chatWith.id)
      if (alive) setThread(msgs)
    }
    load()
    const id = setInterval(load, 12000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [open, tab, chatWith])

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [aiMessages, thread, open, tab])

  // Close the panel with Escape.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const send = async () => {
    const text = input.trim()
    if (!text) return
    setInput('')
    setError('')
    if (tab === 'ai') {
      const history = [...aiMessages, { role: 'user', content: text }]
      setAiMessages(history)
      setAiBusy(true)
      try {
        const word = getCurrentWord()
        const reply = await askTutor(history, {
          page: PAGE_NAMES[page] || page,
          word: word || undefined,
        })
        setAiMessages([...history, { role: 'assistant', content: reply }])
      } catch (e) {
        setError(e.message)
        setAiMessages(aiMessages) // roll back
        setInput(text)
      } finally {
        setAiBusy(false)
      }
    } else {
      if (!chatWith) return
      try {
        await store.sendMessage(chatWith.id, text)
        setThread([
          ...thread,
          { id: 't-' + Date.now(), from_id: profile.id, to_id: chatWith.id, body: text, created_at: new Date().toISOString() },
        ])
      } catch (e) {
        setError(e.message)
        setInput(text)
      }
    }
  }

  // Save one Q&A exchange from the AI chat as a mini lesson.
  const saveExchange = async (idx) => {
    const q = aiMessages[idx - 1]
    const a = aiMessages[idx]
    if (!q || !a) return
    const title = q.content.length > 60 ? q.content.slice(0, 57) + '…' : q.content
    await store.saveLesson({
      title,
      topic: q.content.slice(0, 120),
      source: 'chat',
      content: {
        title,
        topic: q.content,
        level: 'chat',
        sections: [{ heading: q.content, body: a.content, examples: [] }],
        practice: [],
      },
    })
    setSavedIdx({ ...savedIdx, [idx]: true })
    onLessonSaved?.()
  }

  return (
    <>
      <button
        className="chat-fab"
        data-tour="chat-fab"
        title="Ask Zé or your teacher"
        onClick={() => setOpen(!open)}
      >
        {open ? '✕' : '🧑‍🏫'}
      </button>

      {open && (
        <div className="chat-panel">
          <div className="chat-head">
            <span style={{ fontSize: '1.3rem' }}>🧑‍🏫</span>
            <strong>{tab === 'ai' ? 'Zé — AI tutor' : `Chat with ${chatWith?.name || 'teacher'}`}</strong>
          </div>
          <div className="chat-tabs">
            <button className={tab === 'ai' ? 'active' : ''} onClick={() => setTab('ai')}>
              ✨ Ask the AI
            </button>
            <button
              className={tab === 'teacher' ? 'active' : ''}
              onClick={() => setTab('teacher')}
              disabled={!teacherTabAvailable}
              title={teacherTabAvailable ? '' : 'Join a class (Settings) to message a teacher'}
            >
              🧑‍🏫 {isTeacher ? 'My students' : 'My teacher'}
            </button>
          </div>

          <div className="chat-body" ref={bodyRef}>
            {tab === 'ai' && (
              <>
                {aiMessages.length === 0 && (
                  <div className="chat-msg them">
                    Oi! 👋 I'm Zé, your Portuguese tutor. Ask me anything — a word, a conjugation,
                    "how do I say…", or ask me to explain something from this page.
                    {!aiAvailable() && (
                      <div className="error" style={{ marginTop: 6 }}>
                        (AI isn't connected yet — see Settings → Connections.)
                      </div>
                    )}
                  </div>
                )}
                {aiMessages.map((m, idx) => (
                  <div key={idx} className={'chat-msg ' + (m.role === 'user' ? 'me' : 'them')}>
                    {m.content}
                    {m.role === 'assistant' && (
                      <div className="msg-actions">
                        {savedIdx[idx] ? (
                          <span className="success small">Saved to Mini lessons ✔</span>
                        ) : (
                          <button className="btn ghost small" onClick={() => saveExchange(idx)}>
                            📚 Save as mini lesson
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {aiBusy && <div className="chat-msg them">…</div>}
              </>
            )}

            {tab === 'teacher' && (
              <>
                {isTeacher && (
                  <select
                    value={chatWith?.id || ''}
                    onChange={(e) => {
                      const s = students.find((x) => x.id === e.target.value)
                      if (s) setChatWith({ id: s.id, name: s.display_name || s.email })
                      setThread([])
                    }}
                  >
                    {students.length === 0 && <option value="">No students yet</option>}
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.display_name || s.email}
                      </option>
                    ))}
                  </select>
                )}
                {!isTeacher && !hasTeacher && (
                  <div className="chat-msg them">
                    You're not in a class yet. Ask your teacher for their class code and enter it in
                    Settings → My class.
                  </div>
                )}
                {thread.map((m) => (
                  <div key={m.id} className={'chat-msg ' + (m.from_id === profile.id ? 'me' : 'them')}>
                    {m.body}
                  </div>
                ))}
                {chatWith && thread.length === 0 && (
                  <p className="muted small" style={{ textAlign: 'center' }}>
                    No messages yet — say oi! Ask about the next class, homework, anything.
                  </p>
                )}
              </>
            )}
            {error && <p className="error">{error}</p>}
          </div>

          <div className="chat-input">
            <input
              type="text"
              value={input}
              placeholder={tab === 'ai' ? 'Ask about Portuguese…' : 'Message…'}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              disabled={aiBusy || (tab === 'teacher' && !chatWith)}
            />
            <button onClick={send} disabled={aiBusy || !input.trim()} title="Send" aria-label="Send message">
              ➤
            </button>
          </div>
        </div>
      )}
    </>
  )
}
