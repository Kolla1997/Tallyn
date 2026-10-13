// Imported first in main.jsx, so it runs before the Supabase client (which
// App imports) reads the address: see recovery.js (#22).
import { captureRecoveryFromURL } from './recovery.js'

captureRecoveryFromURL()
