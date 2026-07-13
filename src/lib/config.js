// Runtime configuration. Supabase credentials can come from build-time env
// vars (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) or be pasted into the
// Settings screen at runtime (stored in localStorage) so non-technical users
// can connect without rebuilding.
const LS_KEY = 'fala.config.v1'

function readLocal() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY)) || {}
  } catch {
    return {}
  }
}

export function getConfig() {
  const local = readLocal()
  return {
    supabaseUrl: local.supabaseUrl || import.meta.env.VITE_SUPABASE_URL || '',
    supabaseAnonKey: local.supabaseAnonKey || import.meta.env.VITE_SUPABASE_ANON_KEY || '',
    anthropicApiKey: local.anthropicApiKey || '',
  }
}

export function saveConfig(partial) {
  const next = { ...readLocal(), ...partial }
  localStorage.setItem(LS_KEY, JSON.stringify(next))
  return next
}

export function hasSupabase() {
  const c = getConfig()
  return Boolean(c.supabaseUrl && c.supabaseAnonKey)
}
