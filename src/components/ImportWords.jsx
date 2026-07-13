import React, { useState } from 'react'
import * as store from '../lib/store.js'
import { extractWordsFromText, aiAvailable } from '../lib/ai.js'

// Import screen: the main way to load your ~2000 word list.
//  - Paste / CSV: one entry per line — "portuguese, english, type, category"
//    (only portuguese is required; commas/semicolons/tabs all work)
//  - Document mode: paste any class handout or transcription and AI pulls out
//    the vocabulary with translations and categories.
export default function ImportWords({ reload, goTo }) {
  const [tab, setTab] = useState('list') // list | document
  const [text, setText] = useState('')
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [defaultCategory, setDefaultCategory] = useState('my-words')
  const [asPhrases, setAsPhrases] = useState(false)

  const parseList = () => {
    setError('')
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    const items = []
    for (const line of lines) {
      if (/^(portuguese|palavra|word)[,;\t]/i.test(line)) continue // header row
      const parts = line.split(/[;\t]|,(?![^(]*\))/).map((p) => p.trim())
      const [pt, en, pos, category] = parts
      if (!pt) continue
      items.push({
        portuguese: pt,
        english: en || '',
        pos: pos || (asPhrases || pt.includes(' ') ? 'phrase' : 'noun'),
        category: (category || defaultCategory).toLowerCase(),
        is_phrase: asPhrases || pt.split(' ').length > 2,
      })
    }
    if (!items.length) {
      setError('Nothing to import — paste one word per line.')
      return
    }
    setPreview(items)
  }

  const extractDoc = async () => {
    setError('')
    setBusy(true)
    try {
      const items = await extractWordsFromText(text)
      if (!items.length) setError('No Portuguese vocabulary found in that text.')
      else setPreview(items)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const content = await file.text()
    setText(content)
  }

  const confirm = async () => {
    setBusy(true)
    try {
      const added = await store.addWords(preview)
      setResult({ added, skipped: preview.length - added })
      setPreview(null)
      setText('')
      reload()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <h1>Import words</h1>

      {result && (
        <div className="card">
          <p className="success">
            ✅ Imported {result.added} new {result.added === 1 ? 'word' : 'words'}
            {result.skipped > 0 ? ` (${result.skipped} already in your list)` : ''}.
          </p>
          <div className="row">
            <button className="btn" onClick={() => goTo('words')}>See my words</button>
            <button className="btn ghost" onClick={() => setResult(null)}>Import more</button>
          </div>
        </div>
      )}

      {!preview && !result && (
        <>
          <div className="chips">
            <button className={'chip ' + (tab === 'list' ? 'active' : '')} onClick={() => setTab('list')}>
              📋 Word list / CSV
            </button>
            <button
              className={'chip ' + (tab === 'document' ? 'active' : '')}
              onClick={() => setTab('document')}
            >
              📄 Class document / transcript (AI)
            </button>
          </div>

          <div className="card">
            {tab === 'list' ? (
              <>
                <p className="muted small">
                  One entry per line: <code>portuguese, english, type, category</code> — only the
                  Portuguese is required. Commas, semicolons, or tabs all work, so you can paste
                  straight from a spreadsheet.
                </p>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={'casa, house, noun, home\ncorrer, to run, verb\nsaudade'}
                  style={{ minHeight: 180 }}
                />
                <div className="row">
                  <div className="grow">
                    <label>Default category</label>
                    <input
                      type="text"
                      value={defaultCategory}
                      onChange={(e) => setDefaultCategory(e.target.value)}
                    />
                  </div>
                  <label className="row" style={{ gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={asPhrases}
                      onChange={(e) => setAsPhrases(e.target.checked)}
                    />
                    These are phrases
                  </label>
                </div>
                <div className="row">
                  <input type="file" accept=".txt,.csv" onChange={onFile} />
                </div>
                <button className="btn" onClick={parseList} disabled={!text.trim()}>
                  Preview import →
                </button>
              </>
            ) : (
              <>
                <p className="muted small">
                  Paste a document or transcription from your Portuguese class (or upload a .txt
                  file). AI will pull out the vocabulary with translations and categories so you can
                  learn what you covered.
                </p>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Paste your class notes, handout, or lesson transcript here…"
                  style={{ minHeight: 220 }}
                />
                <div className="row">
                  <input type="file" accept=".txt,.md,.csv,.srt,.vtt" onChange={onFile} />
                </div>
                {!aiAvailable() && (
                  <p className="muted small">
                    This needs AI — connect Supabase with edge functions, or add an Anthropic API
                    key in Settings.
                  </p>
                )}
                <button className="btn" onClick={extractDoc} disabled={busy || !text.trim()}>
                  {busy ? 'Reading your document…' : '✨ Extract vocabulary →'}
                </button>
              </>
            )}
            {error && <p className="error">{error}</p>}
          </div>
        </>
      )}

      {preview && (
        <div className="card">
          <div className="row">
            <h2 style={{ margin: 0 }} className="grow">
              {preview.length} words ready to import
            </h2>
            <button className="btn ghost small" onClick={() => setPreview(null)}>← Back</button>
          </div>
          <div style={{ maxHeight: '45vh', overflowY: 'auto', margin: '10px 0' }}>
            {preview.map((it, i) => (
              <div className="word-row" key={i}>
                <div className="grow">
                  <span className="pt">{it.portuguese}</span>{' '}
                  <span className="en">{it.english}</span>
                  <div className="meta">
                    {it.pos} · {it.category}
                  </div>
                </div>
                <button
                  className="icon-btn"
                  title="Remove from import"
                  onClick={() => setPreview(preview.filter((_, j) => j !== i))}
                >
                  ✖
                </button>
              </div>
            ))}
          </div>
          {error && <p className="error">{error}</p>}
          <button className="btn" onClick={confirm} disabled={busy}>
            {busy ? 'Importing…' : `Import ${preview.length} words`}
          </button>
        </div>
      )}
    </div>
  )
}
