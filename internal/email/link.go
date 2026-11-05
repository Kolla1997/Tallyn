package email

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"strings"
)

// Unsubscribe links (#269). A link names one person, one household and one
// email type (and the child, for a child's reconnect emails), signed with a
// key only the server has. It can only turn that one email off (or back on);
// it never shows account data. Links don't expire: changing the key
// (TOKEN_ENCRYPTION_KEY) cancels them all.

// Link is what an unsubscribe link may change.
type Link struct {
	UserID      string
	HouseholdID string
	Kind        string // db.EmailReconnect, db.EmailPaymentDue or db.EmailKidReconnect
	Kid         string // the child, for db.EmailKidReconnect
}

// ErrBadLink is a link that wasn't made by this server, or was changed.
var ErrBadLink = errors.New("email: bad unsubscribe link")

// DeriveLinkKey makes the signing key from the token encryption key, like
// api.DeriveClosingKey.
func DeriveLinkKey(tokenKey []byte) []byte {
	m := hmac.New(sha256.New, tokenKey)
	m.Write([]byte("tallyn unsubscribe link key v1"))
	return m.Sum(nil)
}

var b64 = base64.RawURLEncoding

// Sign returns the link's token: its fields, then their signature.
func Sign(key []byte, l Link) string {
	payload := b64.EncodeToString([]byte(strings.Join([]string{l.UserID, l.HouseholdID, l.Kind, l.Kid}, "|")))
	return payload + "." + b64.EncodeToString(mac(key, payload))
}

// Verify checks token and returns its link.
func Verify(key []byte, token string) (Link, error) {
	payload, sig, ok := strings.Cut(token, ".")
	got, err := b64.DecodeString(sig)
	if !ok || err != nil || len(key) == 0 || !hmac.Equal(got, mac(key, payload)) {
		return Link{}, ErrBadLink
	}
	raw, err := b64.DecodeString(payload)
	if err != nil {
		return Link{}, ErrBadLink
	}
	f := strings.Split(string(raw), "|")
	if len(f) != 4 {
		return Link{}, ErrBadLink
	}
	return Link{UserID: f[0], HouseholdID: f[1], Kind: f[2], Kid: f[3]}, nil
}

func mac(key []byte, payload string) []byte {
	m := hmac.New(sha256.New, key)
	m.Write([]byte(payload))
	return m.Sum(nil)
}
