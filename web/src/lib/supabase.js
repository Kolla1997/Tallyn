import { createClient } from '@supabase/supabase-js'

// The publishable (anon) key is public by design. The service role key must
// never be used here (CLAUDE.md §7). Values come from web/.env.local.
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const configured = Boolean(url && key)

export const supabase = configured ? createClient(url, key) : null
