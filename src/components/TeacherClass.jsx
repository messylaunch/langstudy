import React, { useEffect, useState } from 'react'
import * as store from '../lib/store.js'

// Teacher tools: class code, student progress, homework with attached words.
export default function TeacherClass({ profile }) {
  const [students, setStudents] = useState([])
  const [assignments, setAssignments] = useState([])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    try {
      const [s, a] = await Promise.all([store.listMyStudents(), store.listAssignmentsAsTeacher()])
      setStudents(s)
      setAssignments(a)
    } catch (e) {
      setError(e.message)
    }
  }

  useEffect(() => {
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (store.mode() === 'local') {
    return (
      <div>
        <h1>My Class</h1>
        <div className="card">
          <p className="muted">
            Classes need the Supabase backend — in local demo mode there are no other users to
            teach. Connect Supabase (Settings → Connections) to invite students.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1>My Class</h1>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Invite students</h2>
        <p>
          Share this class code — students enter it in <em>Settings → My class</em> to join:
        </p>
        <p style={{ fontSize: '1.8rem', fontWeight: 800, letterSpacing: 4, color: 'var(--green-dark)' }}>
          {profile?.teacher_code || '—'}
        </p>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Students ({students.length})</h2>
        {students.length === 0 && <p className="muted">No students yet — share your class code above.</p>}
        {students.map((s) => (
          <div className="word-row" key={s.id}>
            {s.avatar_url ? (
              <img className="avatar" src={s.avatar_url} alt="" />
            ) : (
              <span style={{ fontSize: '1.4rem' }}>🧑‍🎓</span>
            )}
            <div className="grow">
              <div className="pt">{s.display_name || s.email}</div>
              <div className="meta">
                last studied {s.last ? String(s.last).slice(0, 10) : 'never'}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div>
                <strong>{s.total}</strong> <span className="muted small">words</span>
              </div>
              <div className="muted small">
                {s.learned} learned · {s.active} in progress
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="row">
          <h2 style={{ margin: 0 }} className="grow">Homework</h2>
          <button className="btn small" onClick={() => setCreating(true)} disabled={students.length === 0}>
            ＋ Assign homework
          </button>
        </div>
        {assignments.length === 0 && (
          <p className="muted">No assignments yet. Attach a word list from your class and every student gets it with one tap.</p>
        )}
        {assignments.map((a) => (
          <div key={a.id} style={{ borderBottom: '1px solid var(--line)', padding: '10px 0' }}>
            <div className="pt">
              {a.title}{' '}
              {a.due_date && <span className="muted small">due {a.due_date}</span>}
            </div>
            {a.instructions && <div className="muted small">{a.instructions}</div>}
            <div className="meta" style={{ marginTop: 4 }}>
              {(a.words || []).length} words ·{' '}
              {a.students.filter((s) => s.completed_at).length}/{a.students.length} completed ·{' '}
              {a.students.filter((s) => s.words_added_at).length}/{a.students.length} added the words
            </div>
          </div>
        ))}
      </div>

      {error && <p className="error">{error}</p>}

      {creating && (
        <AssignmentEditor
          students={students}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false)
            load()
          }}
        />
      )}
    </div>
  )
}

function AssignmentEditor({ students, onClose, onSaved }) {
  const [title, setTitle] = useState('')
  const [instructions, setInstructions] = useState('')
  const [wordsText, setWordsText] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [selected, setSelected] = useState(students.map((s) => s.id))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const toggle = (id) =>
    setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      const words = wordsText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .map((line) => {
          const [pt, en, pos, category] = line.split(/[;\t]|,(?![^(]*\))/).map((p) => (p || '').trim())
          return {
            portuguese: pt,
            english: en || '',
            pos: pos || (pt.includes(' ') ? 'phrase' : 'noun'),
            category: (category || 'homework').toLowerCase(),
            is_phrase: pt.split(' ').length > 2,
          }
        })
        .filter((w) => w.portuguese)
      await store.createAssignment({
        title: title.trim(),
        instructions: instructions.trim(),
        words,
        dueDate: dueDate || null,
        studentIds: selected,
      })
      onSaved()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  // A stray backdrop tap must not throw away a composed assignment.
  const safeClose = () => {
    if (!title.trim() && !wordsText.trim() && !instructions.trim()) onClose()
  }

  return (
    <div className="modal-backdrop" onClick={safeClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>Assign homework</h2>
        <label>Title</label>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Week 4 — food vocabulary" autoFocus />
        <label>Instructions (optional)</label>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          style={{ minHeight: 60 }}
          placeholder="Learn these before Thursday's class — we'll roleplay ordering at a restaurant."
        />
        <label>Words to assign — one per line: portuguese, english, type, category</label>
        <textarea
          value={wordsText}
          onChange={(e) => setWordsText(e.target.value)}
          placeholder={'cardápio, menu, noun, food\npedir, to order, verb'}
        />
        <label>Due date (optional)</label>
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        <label>Students</label>
        <div className="chips">
          {students.map((s) => (
            <button
              key={s.id}
              className={'chip ' + (selected.includes(s.id) ? 'active' : '')}
              onClick={() => toggle(s.id)}
            >
              {s.display_name || s.email}
            </button>
          ))}
        </div>
        {error && <p className="error">{error}</p>}
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn" onClick={save} disabled={busy || !title.trim() || selected.length === 0}>
            {busy ? 'Assigning…' : `Assign to ${selected.length} student${selected.length === 1 ? '' : 's'}`}
          </button>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
