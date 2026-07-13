import React, { useState } from 'react'
import { getWordInfo, aiAvailable } from '../lib/ai.js'
import AudioButton from './AudioButton.jsx'

// The "Info" section: AI-generated conjugations, examples, and related words.
// Results are cached in the shared word_info table, so the AI is only called
// the first time anyone anywhere looks a word up.
export default function WordInfo({ word }) {
  const [info, setInfo] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const i = await getWordInfo(word.portuguese, word.english)
      setInfo(i)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  if (!info) {
    return (
      <div className="info-panel">
        {!aiAvailable() && (
          <p className="muted small">
            Word info (conjugations, examples, related words) needs AI — connect Supabase with the
            edge functions deployed, or add an Anthropic API key in Settings.
          </p>
        )}
        <button className="btn secondary small" onClick={load} disabled={loading}>
          {loading ? 'Looking it up…' : 'ℹ️ Show word info'}
        </button>
        {error && <p className="error">{error}</p>}
      </div>
    )
  }

  return (
    <div className="info-panel">
      <p>
        <strong>{word.portuguese}</strong> — {info.translation}
        {info.gender && info.gender !== 'none' ? ` (${info.gender})` : ''}{' '}
        <span className="muted small">{info.pos}</span>
      </p>
      {info.pronunciation_tip && <p className="muted small">🗣️ {info.pronunciation_tip}</p>}

      {info.conjugations && info.conjugations.length > 0 && (
        <>
          <h2>Conjugation</h2>
          {info.conjugations.map((c) => (
            <table key={c.tense}>
              <thead>
                <tr>
                  <th colSpan={2}>{c.tense}</th>
                </tr>
              </thead>
              <tbody>
                {c.forms.map((f) => (
                  <tr key={f.person}>
                    <td className="muted">{f.person}</td>
                    <td>
                      <strong>{f.form}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </>
      )}

      {info.examples?.length > 0 && (
        <>
          <h2>Examples</h2>
          {info.examples.map((ex, i) => (
            <div className="example" key={i}>
              <div>
                {ex.pt} <AudioButton text={ex.pt} />
              </div>
              <div className="en">{ex.en}</div>
            </div>
          ))}
        </>
      )}

      {info.related?.length > 0 && (
        <>
          <h2>Related words</h2>
          <table>
            <tbody>
              {info.related.map((r, i) => (
                <tr key={i}>
                  <td>
                    <strong>{r.pt}</strong>
                  </td>
                  <td>{r.en}</td>
                  <td className="muted small">{r.relation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {info.notes && <p className="muted small">📝 {info.notes}</p>}
    </div>
  )
}
