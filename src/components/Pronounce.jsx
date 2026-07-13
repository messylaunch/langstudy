import React, { useState } from 'react'
import { checkPronunciation, recognitionSupported } from '../lib/speech.js'

// "Say it" pronunciation check: listens with the browser's speech recognizer
// (pt-BR) and scores how close the transcript is to the target.
export default function Pronounce({ target }) {
  const [state, setState] = useState('idle') // idle | listening
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  if (!recognitionSupported()) {
    return <p className="muted small">🎤 Pronunciation check needs Chrome, Edge, or Android.</p>
  }

  const listen = async () => {
    setError('')
    setResult(null)
    setState('listening')
    try {
      const r = await checkPronunciation(target)
      setResult(r)
    } catch (e) {
      setError(e.message)
    } finally {
      setState('idle')
    }
  }

  return (
    <div>
      <button className="btn secondary small" onClick={listen} disabled={state === 'listening'}>
        {state === 'listening' ? '🎤 Listening… say it now' : '🎤 Check my pronunciation'}
      </button>
      {error && <p className="error">{error}</p>}
      {result && (
        <div className={'pron-result ' + (result.pass ? 'pass' : 'fail')}>
          {result.transcript ? (
            <>
              <div>
                Heard: <strong>“{result.transcript}”</strong> — {Math.round(result.score * 100)}% match
              </div>
              <div>{result.pass ? '✅ Sounds great!' : '🔁 Close — listen again and give it another go.'}</div>
            </>
          ) : (
            <div>Didn’t catch that — try speaking a bit louder, closer to the mic.</div>
          )}
        </div>
      )}
    </div>
  )
}
