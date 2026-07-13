import React, { useEffect, useState } from 'react'
import * as store from '../lib/store.js'
import { generateStory, aiAvailable } from '../lib/ai.js'
import { normalizePt } from '../lib/speech.js'
import AudioButton from './AudioButton.jsx'
import { pressable } from '../lib/a11y.js'

export default function Story({ words, reload }) {
  const [stories, setStories] = useState([])
  const [current, setCurrent] = useState(null)
  const [topic, setTopic] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [wordPopup, setWordPopup] = useState(null) // {token, match}
  const [showEn, setShowEn] = useState({})

  useEffect(() => {
    store.listStories().then(setStories).catch(() => {})
  }, [])

  const knownWords = words
    .filter((w) => ['learning', 'recognize', 'learned', 'trouble'].includes(w.status))
    .map((w) => w.portuguese)

  const generate = async () => {
    setBusy(true)
    setError('')
    try {
      const story = await generateStory(knownWords, { topic: topic.trim() || undefined })
      const saved = await store.saveStory({ title: story.title, content: story })
      setCurrent({ ...saved, content: story })
      setStories([saved, ...stories])
      setShowEn({})
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const clickWord = (token) => {
    const norm = normalizePt(token)
    if (!norm) return
    const match = words.find((w) => normalizePt(w.portuguese) === norm)
    setWordPopup({ token: token.replace(/[.,!?;:"«»]/g, ''), match })
  }

  const addOrRecognize = async () => {
    if (wordPopup.match) {
      await store.setStatus(wordPopup.match.id, 'recognize')
    } else {
      // check the story's new_words list for a translation
      const nw = current?.content?.new_words?.find(
        (n) => normalizePt(n.portuguese) === normalizePt(wordPopup.token)
      )
      await store.addWord({
        portuguese: nw?.portuguese || wordPopup.token.toLowerCase(),
        english: nw?.english || '',
        category: 'from-stories',
        status: 'recognize',
      })
    }
    setWordPopup(null)
    reload()
  }

  const content = current?.content

  return (
    <div>
      <h1>Stories</h1>

      {!current && (
        <>
          <div className="card">
            <p className="muted">
              Generate a short story written with the {knownWords.length} words you already know.
              Tap any word while reading to add it to your “Recognize” list.
            </p>
            <label>Topic (optional)</label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. a day at the beach, ordering food…"
            />
            {!aiAvailable() && (
              <p className="muted small">
                Story generation needs AI — connect Supabase with edge functions, or add an
                Anthropic API key in Settings.
              </p>
            )}
            {error && <p className="error">{error}</p>}
            <button className="btn" onClick={generate} disabled={busy || knownWords.length < 10}>
              {busy ? 'Writing your story…' : '✨ Write me a story'}
            </button>
            {knownWords.length < 10 && (
              <p className="muted small">Learn at least 10 words first so the story has material.</p>
            )}
          </div>

          {stories.length > 0 && (
            <div className="card">
              <h2 style={{ marginTop: 0 }}>Saved stories</h2>
              {stories.map((s) => (
                <div className="word-row" key={s.id}>
                  <div
                    className="grow"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setCurrent(s)}
                    {...pressable(() => setCurrent(s))}
                  >
                    <div className="pt">{s.title}</div>
                    <div className="meta">{String(s.created_at || '').slice(0, 10)}</div>
                  </div>
                  <button
                    className="icon-btn"
                    title="Delete story"
                    onClick={async () => {
                      if (!confirm(`Delete "${s.title}"?`)) return
                      await store.deleteStory(s.id)
                      setStories(stories.filter((x) => x.id !== s.id))
                    }}
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {current && content && (
        <div className="card">
          <div className="row">
            <h2 style={{ margin: 0 }} className="grow">{content.title}</h2>
            <AudioButton text={content.sentences.map((s) => s.pt).join(' ')} title="Listen to the whole story" />
            <button className="btn ghost small" onClick={() => setCurrent(null)}>← Back</button>
          </div>
          <p className="muted small">
            Tap a sentence to show its translation. Tap a word to mark it as recognized or add it to
            your list.
          </p>
          {content.sentences.map((s, i) => (
            <div key={i}>
              <div className="story-sentence">
                {s.pt.split(/(\s+)/).map((tok, j) =>
                  tok.trim() ? (
                    <span
                      key={j}
                      className="story-word"
                      onClick={(e) => {
                        e.stopPropagation()
                        clickWord(tok)
                      }}
                      {...pressable(() => clickWord(tok))}
                    >
                      {tok}
                    </span>
                  ) : (
                    tok
                  )
                )}
                <button
                  className="icon-btn small"
                  onClick={() => setShowEn({ ...showEn, [i]: !showEn[i] })}
                  title="Show translation"
                >
                  💬
                </button>
                <AudioButton text={s.pt} />
              </div>
              {showEn[i] && <div className="story-en">{s.en}</div>}
            </div>
          ))}

          {content.new_words?.length > 0 && (
            <>
              <h2>New words in this story</h2>
              {content.new_words.map((n, i) => (
                <div className="word-row" key={i}>
                  <div className="grow">
                    <span className="pt">{n.portuguese}</span>{' '}
                    <span className="en">{n.english}</span>
                  </div>
                  <button
                    className="btn secondary small"
                    onClick={async () => {
                      await store.addWord({
                        portuguese: n.portuguese,
                        english: n.english,
                        category: 'from-stories',
                        status: 'recognize',
                      })
                      reload()
                    }}
                  >
                    ＋ Add
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {wordPopup && (
        <div className="modal-backdrop" onClick={() => setWordPopup(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>
              {wordPopup.token} <AudioButton text={wordPopup.token} />
            </h2>
            {wordPopup.match ? (
              <p className="muted">
                In your list: <strong>{wordPopup.match.english}</strong> — currently “
                {wordPopup.match.status}”.
              </p>
            ) : (
              <p className="muted">Not in your word list yet.</p>
            )}
            <div className="row">
              <button className="btn" onClick={addOrRecognize}>
                {wordPopup.match ? '✔ Mark as recognized' : '＋ Add to my list as recognized'}
              </button>
              <button className="btn ghost" onClick={() => setWordPopup(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
