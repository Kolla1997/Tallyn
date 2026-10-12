package api

import (
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/Kolla1997/Tallyn/internal/auth"
)

// Rate limits (#24, ADR 0011): per signed-in person, in memory, fixed
// windows. A generous limit on every API call, and tighter ones where each
// call costs something or reaches other people (Plaid tokens, invites).
// Over the limit: 429 with Retry-After. One server process for now; a shared
// store comes with more than one.

type limiter struct {
	mu    sync.Mutex
	limit int
	per   time.Duration
	now   func() time.Time
	seen  map[string]*window
}

type window struct {
	start time.Time
	count int
}

func newLimiter(limit int, per time.Duration) *limiter {
	return &limiter{limit: limit, per: per, now: time.Now, seen: map[string]*window{}}
}

// allow counts one call for key and says whether it's within the limit, and
// if not, how long until the window resets.
func (l *limiter) allow(key string) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	w, ok := l.seen[key]
	if !ok || now.Sub(w.start) >= l.per {
		if len(l.seen) > 10000 {
			l.sweep(now)
		}
		l.seen[key] = &window{start: now, count: 1}
		return true, 0
	}
	if w.count >= l.limit {
		return false, w.start.Add(l.per).Sub(now)
	}
	w.count++
	return true, 0
}

// sweep drops windows that have ended, so the map can't grow forever.
func (l *limiter) sweep(now time.Time) {
	for k, w := range l.seen {
		if now.Sub(w.start) >= l.per {
			delete(l.seen, k)
		}
	}
}

// limited wraps a handler with a limiter keyed by the signed-in person.
// Requests without a person go through: RequireAuth answers them.
func limited(l *limiter, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s, ok := auth.FromContext(r.Context()); ok {
			if ok, wait := l.allow(s.UserID); !ok {
				secs := int(wait.Seconds()) + 1
				w.Header().Set("Retry-After", strconv.Itoa(secs))
				writeError(w, http.StatusTooManyRequests, "too_many_requests")
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

// limits are the API's rate limits. Each router gets its own, so tests
// don't share counts.
type limits struct {
	all     *limiter // every API call
	plaid   *limiter // Link, reconnect and exchange: each call reaches Plaid
	invites *limiter // creating invites
	accepts *limiter // accepting an invite link
}

func newLimits() limits {
	return limits{
		all:     newLimiter(600, time.Minute),
		plaid:   newLimiter(30, time.Hour),
		invites: newLimiter(20, time.Hour),
		accepts: newLimiter(10, 10*time.Minute),
	}
}
