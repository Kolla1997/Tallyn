package tokencrypt

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"testing"
)

// Keys and tokens here are random or obviously fake.
func newKey(t *testing.T) string {
	t.Helper()
	k := make([]byte, 32)
	if _, err := rand.Read(k); err != nil {
		t.Fatal(err)
	}
	return base64.StdEncoding.EncodeToString(k)
}

func newBox(t *testing.T) *Box {
	t.Helper()
	b, err := New(newKey(t))
	if err != nil {
		t.Fatal(err)
	}
	return b
}

var (
	token = []byte("access-sandbox-00000000-fake-token")
	item  = []byte("fake-item-id-1")
)

func TestRoundTrip(t *testing.T) {
	b := newBox(t)
	sealed, err := b.Seal(token, item)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(sealed, token) {
		t.Fatal("ciphertext contains the plaintext")
	}
	if sealed[0] != version1 || len(sealed) != 1+12+len(token)+16 {
		t.Fatalf("unexpected format: version %d, len %d", sealed[0], len(sealed))
	}
	got, err := b.Open(sealed, item)
	if err != nil || !bytes.Equal(got, token) {
		t.Fatalf("Open = %q, %v", got, err)
	}
}

func TestFreshNonce(t *testing.T) {
	b := newBox(t)
	s1, _ := b.Seal(token, item)
	s2, _ := b.Seal(token, item)
	if bytes.Equal(s1, s2) {
		t.Fatal("two seals of the same token are identical")
	}
}

func TestOpenRejects(t *testing.T) {
	b := newBox(t)
	sealed, _ := b.Seal(token, item)

	flip := func(i int) []byte {
		c := bytes.Clone(sealed)
		c[i] ^= 1
		return c
	}
	other := newBox(t)
	cases := map[string]func() ([]byte, error){
		"other item":      func() ([]byte, error) { return b.Open(sealed, []byte("fake-item-id-2")) },
		"other key":       func() ([]byte, error) { return other.Open(sealed, item) },
		"tampered nonce":  func() ([]byte, error) { return b.Open(flip(1), item) },
		"tampered body":   func() ([]byte, error) { return b.Open(flip(len(sealed)/2), item) },
		"tampered tag":    func() ([]byte, error) { return b.Open(flip(len(sealed)-1), item) },
		"unknown version": func() ([]byte, error) { return b.Open(flip(0), item) },
		"truncated":       func() ([]byte, error) { return b.Open(sealed[:20], item) },
		"empty":           func() ([]byte, error) { return b.Open(nil, item) },
	}
	for name, open := range cases {
		t.Run(name, func(t *testing.T) {
			if pt, err := open(); !errors.Is(err, ErrDecrypt) || pt != nil {
				t.Fatalf("got %q, %v; want ErrDecrypt", pt, err)
			}
		})
	}
}

func TestNewRejectsBadKeys(t *testing.T) {
	for name, key := range map[string]string{
		"empty":       "",
		"not base64":  "not-a-key!!",
		"16 bytes":    base64.StdEncoding.EncodeToString(make([]byte, 16)),
		"64 bytes":    base64.StdEncoding.EncodeToString(make([]byte, 64)),
		"placeholder": "replace-me",
	} {
		if _, err := New(key); err == nil {
			t.Errorf("%s: New accepted it", name)
		}
	}
	if _, err := New("  " + newKey(t) + "\n"); err != nil {
		t.Errorf("surrounding whitespace: %v", err)
	}
}
