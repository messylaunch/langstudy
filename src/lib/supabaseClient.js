import { createClient } from '@supabase/supabase-js'
import { getConfig, hasSupabase } from './config.js'

let client = null

export function getSupabase() {
  if (!hasSupabase()) return null
  if (!client) {
    const { supabaseUrl, supabaseAnonKey } = getConfig()
    client = createClient(supabaseUrl, supabaseAnonKey)
  }
  return client
}

export function resetSupabase() {
  client = null
}
