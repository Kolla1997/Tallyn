import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// shadcn's class helper for the draft lab (#183)
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}
