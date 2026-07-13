// Data layer with two backends:
//  - 'supabase' when Supabase is configured (per-user words, shared AI cache, storage)
//  - 'local'    demo mode backed by localStorage so the app works immediately
import { getSupabase } from './supabaseClient.js'
import { hasSupabase } from './config.js'
import { SEED_WORDS as RAW_SEED_WORDS } from '../data/seedWords.js'

// A few words appear under two categories in the seed data — keep the first.
const SEED_WORDS = (() => {
  const seen = new Set()
  return RAW_SEED_WORDS.filter(([pt]) => {
    const k = pt.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
})()

export const STATUSES = ['unknown', 'learning', 'trouble', 'recognize', 'learned']
export const STATUS_LABELS = {
  unknown: "Don't know",
  learning: 'Learning',
  trouble: 'Trouble remembering',
  recognize: 'Recognize',
  learned: 'Learned',
}
export const STATUS_COLORS = {
  unknown: '#8a8a8a',
  learning: '#d98510',
  trouble: '#c2403a',
  recognize: '#2b6cb0',
  learned: '#0e7a4d',
}

export const DEFAULT_SETTINGS = {
  learningLimit: 20, // max words allowed in learning+trouble at once
  newPerSession: 10, // new words introduced per study session
  reminderTime: '19:00',
  remindersEnabled: false,
  dailyGoal: 20, // cards per day
}

export function mode() {
  return hasSupabase() ? 'supabase' : 'local'
}

// ---------------------------------------------------------------- local mode
const LS_DATA = 'fala.data.v1'

function slugify(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function loadLocal() {
  try {
    const d = JSON.parse(localStorage.getItem(LS_DATA))
    if (d && d.words) return d
  } catch {
    /* fall through */
  }
  const now = new Date().toISOString()
  const data = {
    profile: {
      id: 'local-user',
      email: 'local@device',
      display_name: 'Local profile',
      role: 'master',
      settings: { ...DEFAULT_SETTINGS },
    },
    words: SEED_WORDS.map((w, i) => ({
      id: 'seed-' + i,
      portuguese: w[0],
      english: w[1],
      pos: w[2],
      category: w[3],
      is_phrase: w[2] === 'phrase',
      image_url: null,
      notes: null,
      status: 'unknown',
      times_seen: 0,
      times_correct: 0,
      last_reviewed: null,
      status_updated_at: null,
      created_at: now,
    })),
    wordInfo: {},
    stories: [],
    activity: {}, // date -> cards reviewed
  }
  localStorage.setItem(LS_DATA, JSON.stringify(data))
  return data
}

function saveLocal(data) {
  localStorage.setItem(LS_DATA, JSON.stringify(data))
}

// ------------------------------------------------------------------ sessions
export async function getSession() {
  if (mode() === 'local') return { user: { id: 'local-user', email: 'local@device' } }
  const sb = getSupabase()
  const { data } = await sb.auth.getSession()
  return data.session
}

export function onAuthChange(cb) {
  if (mode() === 'local') return () => {}
  const sb = getSupabase()
  const { data } = sb.auth.onAuthStateChange(() => cb())
  return () => data.subscription.unsubscribe()
}

export async function signIn(email, password) {
  const sb = getSupabase()
  const { error } = await sb.auth.signInWithPassword({ email, password })
  if (error) throw error
}

export async function signUp(email, password, displayName) {
  const sb = getSupabase()
  const { error } = await sb.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  })
  if (error) throw error
}

export async function signOut() {
  if (mode() === 'local') return
  await getSupabase().auth.signOut()
}

// ------------------------------------------------------------------- profile
export async function getProfile() {
  if (mode() === 'local') {
    const d = loadLocal()
    return { ...d.profile, settings: { ...DEFAULT_SETTINGS, ...d.profile.settings } }
  }
  const sb = getSupabase()
  const { data: auth } = await sb.auth.getUser()
  if (!auth.user) return null
  const { data, error } = await sb.from('profiles').select('*').eq('id', auth.user.id).single()
  if (error) throw error
  return { ...data, settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) } }
}

export async function saveSettings(settings) {
  if (mode() === 'local') {
    const d = loadLocal()
    d.profile.settings = { ...d.profile.settings, ...settings }
    saveLocal(d)
    return
  }
  const sb = getSupabase()
  const { data: auth } = await sb.auth.getUser()
  const { error } = await sb.from('profiles').update({ settings }).eq('id', auth.user.id)
  if (error) throw error
}

export async function updateDisplayName(displayName) {
  if (mode() === 'local') {
    const d = loadLocal()
    d.profile.display_name = displayName
    saveLocal(d)
    return
  }
  const sb = getSupabase()
  const { data: auth } = await sb.auth.getUser()
  const { error } = await sb.from('profiles').update({ display_name: displayName }).eq('id', auth.user.id)
  if (error) throw error
}

// --------------------------------------------------------------------- words
export async function listWords() {
  if (mode() === 'local') {
    return loadLocal().words.slice()
  }
  const sb = getSupabase()
  const all = []
  const page = 1000
  for (let from = 0; ; from += page) {
    const { data, error } = await sb
      .from('words')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, from + page - 1)
    if (error) throw error
    all.push(...data)
    if (data.length < page) break
  }
  return all
}

export async function addWord(fields) {
  const word = {
    portuguese: fields.portuguese.trim(),
    english: (fields.english || '').trim(),
    pos: fields.pos || (fields.is_phrase ? 'phrase' : 'noun'),
    category: fields.category || 'general',
    is_phrase: Boolean(fields.is_phrase),
    image_url: fields.image_url || null,
    notes: fields.notes || null,
    status: fields.status || 'unknown',
  }
  if (mode() === 'local') {
    const d = loadLocal()
    const existing = d.words.find(
      (w) => w.portuguese.toLowerCase() === word.portuguese.toLowerCase()
    )
    if (existing) return existing
    const row = {
      ...word,
      id: 'w-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      times_seen: 0,
      times_correct: 0,
      last_reviewed: null,
      status_updated_at: null,
      created_at: new Date().toISOString(),
    }
    d.words.unshift(row)
    saveLocal(d)
    return row
  }
  const sb = getSupabase()
  const { data: auth } = await sb.auth.getUser()
  const { data, error } = await sb
    .from('words')
    .upsert({ ...word, user_id: auth.user.id }, { onConflict: 'user_id,portuguese', ignoreDuplicates: true })
    .select()
  if (error) throw error
  return data[0] || null
}

export async function addWords(items) {
  if (mode() === 'local') {
    const d = loadLocal()
    const have = new Set(d.words.map((w) => w.portuguese.toLowerCase()))
    let added = 0
    const now = new Date().toISOString()
    for (const it of items) {
      const pt = (it.portuguese || '').trim()
      if (!pt || have.has(pt.toLowerCase())) continue
      have.add(pt.toLowerCase())
      d.words.unshift({
        id: 'w-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        portuguese: pt,
        english: (it.english || '').trim(),
        pos: it.pos || (it.is_phrase ? 'phrase' : 'noun'),
        category: it.category || 'general',
        is_phrase: Boolean(it.is_phrase),
        image_url: null,
        notes: it.notes || null,
        status: it.status || 'unknown',
        times_seen: 0,
        times_correct: 0,
        last_reviewed: null,
        status_updated_at: null,
        created_at: now,
      })
      added++
    }
    saveLocal(d)
    return added
  }
  const sb = getSupabase()
  const { data: auth } = await sb.auth.getUser()
  const rows = items
    .filter((it) => (it.portuguese || '').trim())
    .map((it) => ({
      user_id: auth.user.id,
      portuguese: it.portuguese.trim(),
      english: (it.english || '').trim(),
      pos: it.pos || (it.is_phrase ? 'phrase' : 'noun'),
      category: it.category || 'general',
      is_phrase: Boolean(it.is_phrase),
      notes: it.notes || null,
      status: it.status || 'unknown',
    }))
  // de-dup within the batch itself
  const seen = new Set()
  const unique = rows.filter((r) => {
    const k = r.portuguese.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  let added = 0
  for (let i = 0; i < unique.length; i += 500) {
    const chunk = unique.slice(i, i + 500)
    const { data, error } = await sb
      .from('words')
      .upsert(chunk, { onConflict: 'user_id,portuguese', ignoreDuplicates: true })
      .select('id')
    if (error) throw error
    added += (data || []).length
  }
  return added
}

export async function updateWord(id, fields) {
  if (mode() === 'local') {
    const d = loadLocal()
    const w = d.words.find((x) => x.id === id)
    if (w) Object.assign(w, fields)
    saveLocal(d)
    return
  }
  const sb = getSupabase()
  const { error } = await sb.from('words').update(fields).eq('id', id)
  if (error) throw error
}

export async function deleteWord(id) {
  if (mode() === 'local') {
    const d = loadLocal()
    d.words = d.words.filter((x) => x.id !== id)
    saveLocal(d)
    return
  }
  const sb = getSupabase()
  const { error } = await sb.from('words').delete().eq('id', id)
  if (error) throw error
}

export async function setStatus(id, status) {
  return updateWord(id, { status, status_updated_at: new Date().toISOString() })
}

export async function recordReview(id, correct, newStatus) {
  const now = new Date().toISOString()
  if (mode() === 'local') {
    const d = loadLocal()
    const w = d.words.find((x) => x.id === id)
    if (w) {
      w.times_seen += 1
      if (correct) w.times_correct += 1
      w.last_reviewed = now
      if (newStatus) {
        w.status = newStatus
        w.status_updated_at = now
      }
    }
    const day = now.slice(0, 10)
    d.activity[day] = (d.activity[day] || 0) + 1
    saveLocal(d)
    return
  }
  const sb = getSupabase()
  const { data: rows, error } = await sb.from('words').select('times_seen,times_correct').eq('id', id)
  if (error) throw error
  const cur = rows[0] || { times_seen: 0, times_correct: 0 }
  const fields = {
    times_seen: cur.times_seen + 1,
    times_correct: cur.times_correct + (correct ? 1 : 0),
    last_reviewed: now,
  }
  if (newStatus) {
    fields.status = newStatus
    fields.status_updated_at = now
  }
  await updateWord(id, fields)
  const day = now.slice(0, 10)
  const { data: auth } = await sb.auth.getUser()
  await sb.rpc('bump_activity', { p_day: day }).then(
    () => {},
    () => {
      // rpc missing is non-fatal; activity chart just stays empty
      void auth
    }
  )
}

export async function getActivity() {
  if (mode() === 'local') return loadLocal().activity
  const sb = getSupabase()
  const { data, error } = await sb.from('activity').select('day,cards')
  if (error) return {}
  const out = {}
  for (const r of data) out[r.day] = r.cards
  return out
}

export async function installStarterPack() {
  return addWords(
    SEED_WORDS.map((w) => ({
      portuguese: w[0],
      english: w[1],
      pos: w[2],
      category: w[3],
      is_phrase: w[2] === 'phrase',
    }))
  )
}

// ----------------------------------------------------------- word info cache
export async function getCachedWordInfo(portuguese) {
  const key = portuguese.trim().toLowerCase()
  if (mode() === 'local') {
    return loadLocal().wordInfo[key] || null
  }
  const sb = getSupabase()
  const { data } = await sb.from('word_info').select('info').eq('word', key).maybeSingle()
  return data ? data.info : null
}

export async function saveWordInfo(portuguese, info) {
  const key = portuguese.trim().toLowerCase()
  if (mode() === 'local') {
    const d = loadLocal()
    d.wordInfo[key] = info
    saveLocal(d)
    return
  }
  const sb = getSupabase()
  await sb.from('word_info').upsert({ word: key, info }, { onConflict: 'word' })
}

// ------------------------------------------------------------------- stories
export async function listStories() {
  if (mode() === 'local') return loadLocal().stories.slice()
  const sb = getSupabase()
  const { data, error } = await sb.from('stories').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function saveStory(story) {
  if (mode() === 'local') {
    const d = loadLocal()
    const row = { id: 's-' + Date.now(), ...story, created_at: new Date().toISOString() }
    d.stories.unshift(row)
    saveLocal(d)
    return row
  }
  const sb = getSupabase()
  const { data: auth } = await sb.auth.getUser()
  const { data, error } = await sb
    .from('stories')
    .insert({ user_id: auth.user.id, title: story.title, content: story.content })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteStory(id) {
  if (mode() === 'local') {
    const d = loadLocal()
    d.stories = d.stories.filter((s) => s.id !== id)
    saveLocal(d)
    return
  }
  const sb = getSupabase()
  await sb.from('stories').delete().eq('id', id)
}

// --------------------------------------------------------------------- media
export async function uploadImage(file) {
  if (mode() === 'local') {
    // store as data URL in local mode
    return new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result)
      r.onerror = reject
      r.readAsDataURL(file)
    })
  }
  const sb = getSupabase()
  const { data: auth } = await sb.auth.getUser()
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${auth.user.id}/${Date.now()}.${ext}`
  const { error } = await sb.storage.from('word-images').upload(path, file, { upsert: true })
  if (error) throw error
  const { data } = sb.storage.from('word-images').getPublicUrl(path)
  return data.publicUrl
}

// Shared audio library: one file per word, contributed once, reused by everyone.
export function getAudioUrl(portuguese) {
  if (mode() === 'local') return null
  const sb = getSupabase()
  const { data } = sb.storage.from('word-audio').getPublicUrl(slugify(portuguese) + '.mp3')
  return data.publicUrl
}

export async function uploadAudio(portuguese, blob) {
  if (mode() === 'local') throw new Error('Audio upload needs Supabase')
  const sb = getSupabase()
  const { error } = await sb.storage
    .from('word-audio')
    .upload(slugify(portuguese) + '.mp3', blob, { upsert: true, contentType: 'audio/mpeg' })
  if (error) throw error
}

// --------------------------------------------------------------------- admin
export async function adminListUsers() {
  if (mode() === 'local') {
    const d = loadLocal()
    const words = d.words
    return [
      {
        id: d.profile.id,
        email: d.profile.email,
        display_name: d.profile.display_name,
        role: d.profile.role,
        total: words.length,
        learned: words.filter((w) => w.status === 'learned').length,
        learning: words.filter((w) => ['learning', 'trouble'].includes(w.status)).length,
      },
    ]
  }
  const sb = getSupabase()
  const { data: profiles, error } = await sb.from('profiles').select('*').order('created_at')
  if (error) throw error
  const { data: stats } = await sb.from('words').select('user_id,status')
  const byUser = {}
  for (const s of stats || []) {
    byUser[s.user_id] = byUser[s.user_id] || { total: 0, learned: 0, learning: 0 }
    byUser[s.user_id].total++
    if (s.status === 'learned') byUser[s.user_id].learned++
    if (['learning', 'trouble'].includes(s.status)) byUser[s.user_id].learning++
  }
  return profiles.map((p) => ({ ...p, ...(byUser[p.id] || { total: 0, learned: 0, learning: 0 }) }))
}

export async function resetLocalData() {
  localStorage.removeItem(LS_DATA)
}
