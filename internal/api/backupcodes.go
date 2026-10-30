package api

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"log"
	"net/http"
	"strings"

	"github.com/Kolla1997/Tallyn/internal/db"
)

// Backup codes (#23, ADR 0013): ten one-time codes, shown once, for when
// someone can't use their authenticator. Codes look like 7KQ4-M9TX: eight
// characters from an alphabet without look-alikes (no 0/O, 1/I/L). Only a
// keyed hash is stored (HMAC-SHA-256 with a key the database never sees).

// BackupCodeStore keeps the hashes. *db.DB implements it.
type BackupCodeStore interface {
	BackupCodeStatus(ctx context.Context, userID string) (db.BackupCodeStatus, error)
	ReplaceBackupCodes(ctx context.Context, userID string, hashes [][]byte) error
	UseBackupCode(ctx context.Context, userID string, hash []byte) (bool, error)
	// An owner resetting a teen's 2FA (#120).
	ResetMember2FA(ctx context.Context, userID, householdID, memberID string, removeFactors func(context.Context) error) error
	My2FAReset(ctx context.Context, userID string) (*db.TwoFAReset, error)
}

// FactorRemover removes a person's authenticators. *supabaseadmin.Client
// implements it, with the server-only Supabase key.
type FactorRemover interface {
	RemoveFactors(ctx context.Context, userID string) error
}

const codeAlphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"

// newBackupCodes makes n codes, formatted XXXX-XXXX.
func newBackupCodes(n int) ([]string, error) {
	codes := make([]string, n)
	buf := make([]byte, 8)
	for i := range codes {
		var b strings.Builder
		for j := 0; j < 8; j++ {
			if j == 4 {
				b.WriteByte('-')
			}
			// Rejection sampling keeps every character equally likely.
			for {
				if _, err := rand.Read(buf[:1]); err != nil {
					return nil, err
				}
				if int(buf[0]) < 256-256%len(codeAlphabet) {
					b.WriteByte(codeAlphabet[int(buf[0])%len(codeAlphabet)])
					break
				}
			}
		}
		codes[i] = b.String()
	}
	return codes, nil
}

// normalizeCode accepts what people type: any case, with or without the
// hyphen or spaces. Empty if it can't be a code.
func normalizeCode(s string) string {
	s = strings.ToUpper(strings.NewReplacer("-", "", " ", "", "\t", "").Replace(s))
	if len(s) != 8 {
		return ""
	}
	for _, c := range s {
		if !strings.ContainsRune(codeAlphabet, c) {
			return ""
		}
	}
	return s
}

func hashCode(key []byte, normalized string) []byte {
	m := hmac.New(sha256.New, key)
	m.Write([]byte("tallyn backup code v1\x00"))
	m.Write([]byte(normalized))
	return m.Sum(nil)
}

// DeriveBackupCodeKey makes the hashing key from the server's token
// encryption key, so there's no new secret to manage. Rotating that key
// means everyone makes new backup codes.
func DeriveBackupCodeKey(tokenKey []byte) []byte {
	m := hmac.New(sha256.New, tokenKey)
	m.Write([]byte("tallyn backup-code hashing key v1"))
	return m.Sum(nil)
}

// GET /api/backup-codes: how many are left.
func backupCodeStatus(store BackupCodeStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		s, err := store.BackupCodeStatus(r.Context(), uid)
		if err != nil {
			log.Printf("api: backup code status: %v", err)
			writeError(w, http.StatusInternalServerError, "internal")
			return
		}
		writeJSON(w, http.StatusOK, s)
	}
}

// POST /api/backup-codes: a new set of ten, replacing the old. Needs a 2FA
// code from the last few minutes (step-up, ADR 0009): right after setting up
// 2FA or signing in, or entered again in Settings.
func newBackupCodeSet(store BackupCodeStore, key []byte) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok || !recentCode(w, r) {
			return
		}
		codes, err := newBackupCodes(10)
		if err != nil {
			log.Printf("api: backup codes: %v", err)
			writeError(w, http.StatusInternalServerError, "internal")
			return
		}
		hashes := make([][]byte, len(codes))
		for i, c := range codes {
			hashes[i] = hashCode(key, normalizeCode(c))
		}
		if err := store.ReplaceBackupCodes(r.Context(), uid, hashes); err != nil {
			log.Printf("api: replace backup codes: %v", err)
			writeError(w, http.StatusInternalServerError, "internal")
			return
		}
		log.Printf("api: new backup codes for %s", uid)
		writeJSON(w, http.StatusOK, map[string]any{"codes": codes})
	}
}

// POST /api/recovery/backup-code: a password sign-in plus a backup code
// removes the lost authenticator, so the person sets up a new one straight
// away. The code is the second factor, so 2FA is never skipped. Rate-limited
// and logged; a wrong code changes nothing.
func recoverWithBackupCode(store BackupCodeStore, factors FactorRemover, key []byte) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		var in struct {
			Code string `json:"code"`
		}
		if !readJSON(w, r, &in) {
			return
		}
		code := normalizeCode(in.Code)
		if code == "" {
			writeError(w, http.StatusBadRequest, "wrong_code")
			return
		}
		used, err := store.UseBackupCode(r.Context(), uid, hashCode(key, code))
		if err != nil {
			log.Printf("api: use backup code: %v", err)
			writeError(w, http.StatusInternalServerError, "internal")
			return
		}
		if !used {
			log.Printf("api: wrong backup code for %s", uid)
			writeError(w, http.StatusBadRequest, "wrong_code")
			return
		}
		if err := factors.RemoveFactors(r.Context(), uid); err != nil {
			// This code is spent; the other codes still work for a retry.
			log.Printf("api: recovery for %s: %v", uid, err)
			writeError(w, http.StatusBadGateway, "recovery_failed")
			return
		}
		log.Printf("api: %s recovered with a backup code; authenticators removed", uid)
		w.WriteHeader(http.StatusNoContent)
	}
}
