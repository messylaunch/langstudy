import React, { useMemo, useState } from 'react'
import * as store from '../lib/store.js'
import { STATUSES, STATUS_LABELS, STATUS_COLORS } from '../lib/store.js'
import AudioButton from './AudioButton.jsx'
import WordInfo from './WordInfo.jsx'
import Pronounce from './Pronounce.jsx'

const POS_OPTIONS = ['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction', 'interjection', 'numeral', 'phrase']

export default function WordList({ words, reload }) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [category, setCategory] = useState('all')
  const [pos, setPos] = useState('all')
  const [sort, setSort] = useState('newest')
  const [addedSince, setAddedSince] = useState('') // date filter
  const [expanded, setExpanded] = useState(null)
  const [editing, setEditing] = useState(null) // word object or 'new'
  const [limit, setLimit] = useState(100)

  const categories = useMemo(() => {
    const set = new Set(words.map((w) => w.category || 'general'))
    return ['all', ...[...set].sort()]
  }, [words])

  const filtered = useMemo(() => {
    let list = words
    if (status !== 'all') list = list.filter((w) => w.status === status)
    if (category !== 'all') list = list.filter((w) => (w.category || 'general') === category)
    if (pos !== 'all') list = list.filter((w) => w.pos === pos)
    if (addedSince) list = list.filter((w) => w.created_at >= addedSince)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (w) => w.portuguese.toLowerCase().includes(q) || (w.english || '').toLowerCase().includes(q)
      )
    }
    list = [...list]
    if (sort === 'newest') list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    if (sort === 'oldest') list.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
    if (sort === 'az') list.sort((a, b) => a.portuguese.localeCompare(b.portuguese))
    return list
  }, [words, status, category, pos, search, sort, addedSince])

  return (
    <div>
      <div className="row">
        <h1 className="grow">Words <span className="muted small">({filtered.length})</span></h1>
        <button className="btn small" onClick={() => setEditing('new')}>＋ Add word / phrase</button>
      </div>

      <div className="card">
        <input
          type="text"
          placeholder="Search Portuguese or English…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="chips">
          <button className={'chip ' + (status === 'all' ? 'active' : '')} onClick={() => setStatus('all')}>
            All
          </button>
          {STATUSES.map((s) => (
            <button
              key={s}
              className={'chip ' + (status === s ? 'active' : '')}
              onClick={() => setStatus(s)}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        <div className="row">
          <div className="grow">
            <label>Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((c) => (
                <option key={c} value={c}>{c === 'all' ? 'All categories' : c}</option>
              ))}
            </select>
          </div>
          <div className="grow">
            <label>Type</label>
            <select value={pos} onChange={(e) => setPos(e.target.value)}>
              <option value="all">All types</option>
              {POS_OPTIONS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="grow">
            <label>Sort</label>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="az">A → Z</option>
            </select>
          </div>
          <div className="grow">
            <label>Added since</label>
            <input type="date" value={addedSince} onChange={(e) => setAddedSince(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card">
        {filtered.slice(0, limit).map((w) => (
          <div key={w.id}>
            <div className="word-row">
              {w.image_url && <img className="thumb" src={w.image_url} alt="" />}
              <div className="grow" style={{ cursor: 'pointer' }} onClick={() => setExpanded(expanded === w.id ? null : w.id)}>
                <div className="pt">
                  {w.portuguese}{' '}
                  <span className="badge" style={{ background: STATUS_COLORS[w.status] }}>
                    {STATUS_LABELS[w.status]}
                  </span>
                </div>
                <div className="en">{w.english}</div>
                <div className="meta">
                  {w.pos} · {w.category || 'general'} · added {String(w.created_at || '').slice(0, 10)}
                </div>
              </div>
              <AudioButton text={w.portuguese} />
              <button className="icon-btn" title="Edit" onClick={() => setEditing(w)}>✏️</button>
            </div>
            {expanded === w.id && (
              <div style={{ padding: '4px 8px 16px' }}>
                <div className="chips">
                  {STATUSES.map((s) => (
                    <button
                      key={s}
                      className={'chip ' + (w.status === s ? 'active' : '')}
                      onClick={async () => {
                        await store.setStatus(w.id, s)
                        reload()
                      }}
                    >
                      {STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
                <Pronounce target={w.portuguese} />
                <div style={{ marginTop: 10 }}>
                  <WordInfo word={w} />
                </div>
              </div>
            )}
          </div>
        ))}
        {filtered.length > limit && (
          <button className="btn ghost" style={{ width: '100%' }} onClick={() => setLimit(limit + 200)}>
            Show more ({filtered.length - limit} remaining)
          </button>
        )}
        {filtered.length === 0 && <p className="muted">No words match these filters.</p>}
      </div>

      {editing && (
        <WordEditor
          word={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            reload()
          }}
        />
      )}
    </div>
  )
}

function WordEditor({ word, onClose, onSaved }) {
  const [pt, setPt] = useState(word?.portuguese || '')
  const [en, setEn] = useState(word?.english || '')
  const [pos, setPos] = useState(word?.pos || 'noun')
  const [category, setCategory] = useState(word?.category || 'general')
  const [notes, setNotes] = useState(word?.notes || '')
  const [imageUrl, setImageUrl] = useState(word?.image_url || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    if (!pt.trim()) return
    setBusy(true)
    setError('')
    try {
      const fields = {
        portuguese: pt,
        english: en,
        pos,
        category: category.trim().toLowerCase() || 'general',
        is_phrase: pos === 'phrase' || pt.trim().includes(' '),
        notes,
        image_url: imageUrl || null,
      }
      if (word) await store.updateWord(word.id, fields)
      else await store.addWord(fields)
      onSaved()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const onImageFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const url = await store.uploadImage(file)
      setImageUrl(url)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!confirm(`Delete "${word.portuguese}"?`)) return
    await store.deleteWord(word.id)
    onSaved()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>{word ? 'Edit word' : 'Add a word or phrase'}</h2>
        <label>Portuguese</label>
        <input type="text" value={pt} onChange={(e) => setPt(e.target.value)} autoFocus />
        <label>English meaning</label>
        <input type="text" value={en} onChange={(e) => setEn(e.target.value)} />
        <div className="row">
          <div className="grow">
            <label>Type</label>
            <select value={pos} onChange={(e) => setPos(e.target.value)}>
              {POS_OPTIONS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="grow">
            <label>Category</label>
            <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. food, greetings" />
          </div>
        </div>
        <label>Notes (optional)</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ minHeight: 60 }} />
        <label>Picture (optional)</label>
        {imageUrl && (
          <div className="row" style={{ marginBottom: 8 }}>
            <img src={imageUrl} alt="" style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 10 }} />
            <button className="btn ghost small" onClick={() => setImageUrl('')}>Remove</button>
          </div>
        )}
        <input type="file" accept="image/*" onChange={onImageFile} />
        <input
          type="url"
          value={imageUrl && !imageUrl.startsWith('data:') ? imageUrl : ''}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="…or paste an image URL"
        />
        {error && <p className="error">{error}</p>}
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={save} disabled={busy || !pt.trim()}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <div className="grow" />
          {word && (
            <button className="btn danger small" onClick={remove}>Delete</button>
          )}
        </div>
      </div>
    </div>
  )
}
