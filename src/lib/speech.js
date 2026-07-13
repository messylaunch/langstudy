// Text-to-speech (Brazilian Portuguese), stored-audio playback, and
// pronunciation checking via the browser's speech recognition.
import { getAudioUrl, mode } from './store.js'

let voicesCache = []
if (typeof speechSynthesis !== 'undefined') {
  const load = () => {
    voicesCache = speechSynthesis.getVoices()
  }
  load()
  speechSynthesis.onvoiceschanged = load
}

export function getPtVoice() {
  const voices = voicesCache.length ? voicesCache : (typeof speechSynthesis !== 'undefined' ? speechSynthesis.getVoices() : [])
  return (
    voices.find((v) => v.lang === 'pt-BR') ||
    voices.find((v) => v.lang.startsWith('pt')) ||
    null
  )
}

export function speak(text, rate = 0.9) {
  return new Promise((resolve) => {
    if (typeof speechSynthesis === 'undefined') return resolve(false)
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'pt-BR'
    const voice = getPtVoice()
    if (voice) u.voice = voice
    u.rate = rate
    u.onend = () => resolve(true)
    u.onerror = () => resolve(false)
    speechSynthesis.speak(u)
  })
}

// Play stored audio from the shared library if it exists, otherwise TTS.
// The service worker caches storage audio, so each file downloads once.
export async function playWord(text, rate = 0.9) {
  if (mode() === 'supabase') {
    const url = getAudioUrl(text)
    if (url) {
      const ok = await new Promise((resolve) => {
        const a = new Audio(url)
        a.onended = () => resolve(true)
        a.onerror = () => resolve(false)
        a.play().catch(() => resolve(false))
      })
      if (ok) return 'stored'
    }
  }
  await speak(text, rate)
  return 'tts'
}

// ------------------------------------------------------- pronunciation check
export function recognitionSupported() {
  return typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
}

export function normalizePt(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function levenshtein(a, b) {
  const m = a.length
  const n = b.length
  if (!m) return n
  if (!n) return m
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
  }
  return dp[m][n]
}

export function similarity(said, target) {
  const a = normalizePt(said)
  const b = normalizePt(target)
  if (!a || !b) return 0
  const d = levenshtein(a, b)
  return Math.max(0, 1 - d / Math.max(a.length, b.length))
}

// Listen once and score against the target phrase. Returns
// { transcript, score, pass } or throws if unsupported/denied.
export function checkPronunciation(target, { timeoutMs = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return reject(new Error('Speech recognition is not supported in this browser. Try Chrome or Edge.'))
    const rec = new SR()
    rec.lang = 'pt-BR'
    rec.interimResults = false
    rec.maxAlternatives = 5
    let done = false
    const timer = setTimeout(() => {
      if (!done) {
        done = true
        try { rec.stop() } catch { /* noop */ }
        resolve({ transcript: '', score: 0, pass: false, timedOut: true })
      }
    }, timeoutMs)
    rec.onresult = (e) => {
      if (done) return
      done = true
      clearTimeout(timer)
      let best = { transcript: '', score: 0 }
      for (const alt of e.results[0]) {
        const s = similarity(alt.transcript, target)
        if (s > best.score) best = { transcript: alt.transcript, score: s }
      }
      resolve({ ...best, pass: best.score >= 0.75 })
    }
    rec.onerror = (e) => {
      if (done) return
      done = true
      clearTimeout(timer)
      if (e.error === 'not-allowed') reject(new Error('Microphone access was denied.'))
      else resolve({ transcript: '', score: 0, pass: false, error: e.error })
    }
    rec.onend = () => {
      if (!done) {
        done = true
        clearTimeout(timer)
        resolve({ transcript: '', score: 0, pass: false })
      }
    }
    rec.start()
  })
}
