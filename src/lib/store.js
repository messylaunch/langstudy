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

// Spaced review: how many days a word "rests" before it's due again, by status.
// Trouble words are always due (same-day re-drill); learned words come back
// after two weeks so they can't silently decay.
export const REVIEW_INTERVALS_DAYS = {
  trouble: 0,
  learning: 1,
  recognize: 3,
  learned: 14,
}

export function isDue(word, now = new Date()) {
  const days = REVIEW_INTERVALS_DAYS[word.status]
  if (days === undefined) return false // 'unknown' words are new, not due
  const ref = word.last_reviewed || word.status_updated_at || word.created_at
  if (!ref) return true
  return now - new Date(ref) >= days * 24 * 60 * 60 * 1000
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

export async function signUp(email, password, displayName, role = 'user') {
  const sb = getSupabase()
  const { error } = await sb.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName, role } },
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

// ============================================================================
// v2: account management, teacher classes & homework, notifications, messages,
//     mini lessons, leaderboard.
// ============================================================================

// ------------------------------------------------------------------ account
export async function updateEmail(newEmail) {
  if (mode() === 'local') {
    const d = loadLocal()
    d.profile.email = newEmail
    saveLocal(d)
    return
  }
  const sb = getSupabase()
  const { error } = await sb.auth.updateUser({ email: newEmail })
  if (error) throw error
  const { data: auth } = await sb.auth.getUser()
  await sb.from('profiles').update({ email: newEmail }).eq('id', auth.user.id)
}

export async function updatePassword(newPassword) {
  if (mode() === 'local') throw new Error('Passwords only apply to Supabase accounts')
  const sb = getSupabase()
  const { error } = await sb.auth.updateUser({ password: newPassword })
  if (error) throw error
}

export async function uploadAvatar(file) {
  if (mode() === 'local') {
    const url = await new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result)
      r.onerror = reject
      r.readAsDataURL(file)
    })
    const d = loadLocal()
    d.profile.avatar_url = url
    saveLocal(d)
    return url
  }
  const sb = getSupabase()
  const { data: auth } = await sb.auth.getUser()
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${auth.user.id}/avatar.${ext}`
  const { error } = await sb.storage.from('avatars').upload(path, file, { upsert: true })
  if (error) throw error
  const { data } = sb.storage.from('avatars').getPublicUrl(path)
  const url = data.publicUrl + '?v=' + Date.now()
  await sb.from('profiles').update({ avatar_url: url }).eq('id', auth.user.id)
  return url
}

// ------------------------------------------------------------ notifications
// Notifications are kept after being read — read_at is set, nothing deleted.
export async function listNotifications() {
  if (mode() === 'local') {
    const d = loadLocal()
    return (d.notifications || []).slice(0, 100)
  }
  const sb = getSupabase()
  const { data, error } = await sb
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return []
  return data
}

export async function addNotification(userId, { type = 'info', title, body = '', data = null }) {
  if (mode() === 'local') {
    const d = loadLocal()
    d.notifications = d.notifications || []
    d.notifications.unshift({
      id: 'n-' + Date.now() + Math.random().toString(36).slice(2, 6),
      type, title, body, data,
      read_at: null,
      created_at: new Date().toISOString(),
    })
    saveLocal(d)
    return
  }
  const sb = getSupabase()
  await sb.from('notifications').insert({ user_id: userId, type, title, body, data })
}

export async function markNotificationsRead() {
  const now = new Date().toISOString()
  if (mode() === 'local') {
    const d = loadLocal()
    for (const n of d.notifications || []) if (!n.read_at) n.read_at = now
    saveLocal(d)
    return
  }
  const sb = getSupabase()
  const { data: auth } = await sb.auth.getUser()
  await sb.from('notifications').update({ read_at: now }).eq('user_id', auth.user.id).is('read_at', null)
}

// ----------------------------------------------------------------- messages
export async function listMessages(otherId) {
  if (mode() === 'local') return []
  const sb = getSupabase()
  const { data: auth } = await sb.auth.getUser()
  const me = auth.user.id
  const { data, error } = await sb
    .from('messages')
    .select('*')
    .or(`and(from_id.eq.${me},to_id.eq.${otherId}),and(from_id.eq.${otherId},to_id.eq.${me})`)
    .order('created_at', { ascending: true })
    .limit(200)
  if (error) return []
  return data
}

export async function sendMessage(toId, body) {
  if (mode() === 'local') throw new Error('Messaging needs Supabase')
  const sb = getSupabase()
  const { data: auth } = await sb.auth.getUser()
  const { error } = await sb.from('messages').insert({ from_id: auth.user.id, to_id: toId, body })
  if (error) throw error
  const name = (await getProfile())?.display_name || 'Someone'
  await addNotification(toId, {
    type: 'message',
    title: `💬 New message from ${name}`,
    body: body.slice(0, 120),
  })
}

// ------------------------------------------------------------- mini lessons
export async function listLessons() {
  if (mode() === 'local') {
    const d = loadLocal()
    return (d.lessons || []).slice()
  }
  const sb = getSupabase()
  const { data, error } = await sb.from('lessons').select('*').order('created_at', { ascending: false })
  if (error) return []
  return data
}

export async function saveLesson({ title, topic, source = 'generated', content }) {
  if (mode() === 'local') {
    const d = loadLocal()
    d.lessons = d.lessons || []
    const row = {
      id: 'l-' + Date.now(),
      title, topic, source, content,
      created_at: new Date().toISOString(),
    }
    d.lessons.unshift(row)
    saveLocal(d)
    return row
  }
  const sb = getSupabase()
  const { data: auth } = await sb.auth.getUser()
  const { data, error } = await sb
    .from('lessons')
    .insert({ user_id: auth.user.id, title, topic, source, content })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteLesson(id) {
  if (mode() === 'local') {
    const d = loadLocal()
    d.lessons = (d.lessons || []).filter((l) => l.id !== id)
    saveLocal(d)
    return
  }
  const sb = getSupabase()
  await sb.from('lessons').delete().eq('id', id)
}

// ------------------------------------------------------------ teacher class
export function isTeacherRole(profile) {
  return profile && (profile.role === 'teacher' || profile.role === 'master')
}

export async function joinClass(code) {
  if (mode() === 'local') throw new Error('Classes need Supabase')
  const sb = getSupabase()
  const { data, error } = await sb.rpc('join_class', { p_code: code })
  if (error) throw error
  return data // teacher display name
}

export async function leaveClass() {
  if (mode() === 'local') return
  const sb = getSupabase()
  await sb.rpc('leave_class')
}

export async function listMyStudents() {
  if (mode() === 'local') return []
  const sb = getSupabase()
  const { data: auth } = await sb.auth.getUser()
  const { data: students, error } = await sb
    .from('profiles')
    .select('*')
    .eq('teacher_id', auth.user.id)
    .order('created_at')
  if (error) throw error
  if (!students.length) return []
  const { data: stats } = await sb
    .from('words')
    .select('user_id,status,last_reviewed')
    .in('user_id', students.map((s) => s.id))
  const byUser = {}
  for (const w of stats || []) {
    const b = (byUser[w.user_id] = byUser[w.user_id] || { total: 0, learned: 0, active: 0, last: null })
    b.total++
    if (w.status === 'learned') b.learned++
    if (['learning', 'trouble'].includes(w.status)) b.active++
    if (w.last_reviewed && (!b.last || w.last_reviewed > b.last)) b.last = w.last_reviewed
  }
  return students.map((s) => ({ ...s, ...(byUser[s.id] || { total: 0, learned: 0, active: 0, last: null }) }))
}

// -------------------------------------------------------------- assignments
export async function createAssignment({ title, instructions, words, dueDate, studentIds }) {
  if (mode() === 'local') throw new Error('Homework needs Supabase')
  const sb = getSupabase()
  const { data: auth } = await sb.auth.getUser()
  const { data: assignment, error } = await sb
    .from('assignments')
    .insert({
      teacher_id: auth.user.id,
      title,
      instructions: instructions || null,
      words: words || [],
      due_date: dueDate || null,
    })
    .select()
    .single()
  if (error) throw error
  const rows = studentIds.map((student_id) => ({ assignment_id: assignment.id, student_id }))
  const { error: e2 } = await sb.from('assignment_students').insert(rows)
  if (e2) throw e2
  const teacherName = (await getProfile())?.display_name || 'Your teacher'
  await Promise.all(
    studentIds.map((sid) =>
      addNotification(sid, {
        type: 'homework',
        title: `📚 New homework: ${title}`,
        body: `${teacherName} assigned you ${(words || []).length ? (words.length + ' words') : 'homework'}${dueDate ? ', due ' + dueDate : ''}.`,
        data: { assignment_id: assignment.id },
      })
    )
  )
  return assignment
}

// For teachers: their assignments with per-student completion.
export async function listAssignmentsAsTeacher() {
  if (mode() === 'local') return []
  const sb = getSupabase()
  const { data: auth } = await sb.auth.getUser()
  const { data: assignments, error } = await sb
    .from('assignments')
    .select('*')
    .eq('teacher_id', auth.user.id)
    .order('created_at', { ascending: false })
  if (error) throw error
  if (!assignments.length) return []
  const { data: statuses } = await sb
    .from('assignment_students')
    .select('*')
    .in('assignment_id', assignments.map((a) => a.id))
  return assignments.map((a) => ({
    ...a,
    students: (statuses || []).filter((s) => s.assignment_id === a.id),
  }))
}

// For students: assignments given to me, with my status.
export async function listAssignmentsAsStudent() {
  if (mode() === 'local') return []
  const sb = getSupabase()
  const { data: auth } = await sb.auth.getUser()
  const { data: mine, error } = await sb
    .from('assignment_students')
    .select('*')
    .eq('student_id', auth.user.id)
  if (error || !mine?.length) return []
  const { data: assignments } = await sb
    .from('assignments')
    .select('*')
    .in('id', mine.map((m) => m.assignment_id))
  return (assignments || [])
    .map((a) => ({ ...a, my: mine.find((m) => m.assignment_id === a.id) }))
    .sort((x, y) => (y.created_at || '').localeCompare(x.created_at || ''))
}

export async function acceptAssignmentWords(assignment) {
  const added = await addWords(
    (assignment.words || []).map((w) => ({ ...w, category: w.category || 'homework' }))
  )
  const sb = getSupabase()
  const { data: auth } = await sb.auth.getUser()
  await sb
    .from('assignment_students')
    .update({ words_added_at: new Date().toISOString() })
    .eq('assignment_id', assignment.id)
    .eq('student_id', auth.user.id)
  return added
}

export async function completeAssignment(assignment) {
  const sb = getSupabase()
  const { data: auth } = await sb.auth.getUser()
  await sb
    .from('assignment_students')
    .update({ completed_at: new Date().toISOString() })
    .eq('assignment_id', assignment.id)
    .eq('student_id', auth.user.id)
  const me = (await getProfile())?.display_name || 'A student'
  await addNotification(assignment.teacher_id, {
    type: 'homework',
    title: `✅ ${me} completed "${assignment.title}"`,
    body: '',
    data: { assignment_id: assignment.id },
  })
}

// -------------------------------------------------------------- leaderboard
export async function getLeaderboard() {
  if (mode() === 'local') {
    const d = loadLocal()
    const learned = d.words.filter((w) => w.status === 'learned').length
    const total = Object.values(d.activity || {}).reduce((a, b) => a + b, 0)
    return [
      {
        id: d.profile.id,
        display_name: d.profile.display_name,
        avatar_url: d.profile.avatar_url || null,
        learned,
        week_cards: total,
        points: learned * 10 + total,
      },
    ]
  }
  const sb = getSupabase()
  const { data, error } = await sb.rpc('leaderboard')
  if (error) return []
  return data
}
