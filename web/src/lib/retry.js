import { useCallback, useState } from 'react'

// Try again (#151): runs `load` (which returns a promise) and says whether
// it's still running, so the button can wait in sand.
export function useRetry(load) {
  const [retrying, setRetrying] = useState(false)
  const retry = useCallback(() => {
    setRetrying(true)
    Promise.resolve(load()).finally(() => setRetrying(false))
  }, [load])
  return [retrying, retry]
}
