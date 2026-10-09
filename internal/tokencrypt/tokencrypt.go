// Package tokencrypt encrypts Plaid access tokens before they're stored
// (ADR 0004). The database only ever holds ciphertext.
//
// Format: version (1 byte) | nonce (12 bytes) | AES-256-GCM ciphertext + tag.
// The caller passes associated data (the Plaid item ID), which is
// authenticated but not stored: a ciphertext copied onto another item's row
// won't decrypt. The version byte leaves room to rotate keys later.
//
// Never log plaintext tokens, ciphertexts or the key.
package tokencrypt

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
)

const version1 byte = 1

// ErrDecrypt means the ciphertext was tampered with, belongs to another item,
// or was sealed with a different key. The cause is deliberately not exposed.
var ErrDecrypt = errors.New("tokencrypt: cannot decrypt")

// Box seals and opens tokens with one key.
type Box struct {
	aead cipher.AEAD
}

// New takes TOKEN_ENCRYPTION_KEY: 32 random bytes, base64-encoded
// (`openssl rand -base64 32`).
func New(keyB64 string) (*Box, error) {
	key, err := base64.StdEncoding.DecodeString(strings.TrimSpace(keyB64))
	if err != nil {
		return nil, errors.New("tokencrypt: TOKEN_ENCRYPTION_KEY is not valid base64")
	}
	if len(key) != 32 {
		return nil, fmt.Errorf("tokencrypt: TOKEN_ENCRYPTION_KEY must be 32 bytes, got %d", len(key))
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &Box{aead: aead}, nil
}

// Seal encrypts plaintext, bound to ad. Every call uses a fresh random nonce.
func (b *Box) Seal(plaintext, ad []byte) ([]byte, error) {
	out := make([]byte, 1+b.aead.NonceSize(), 1+b.aead.NonceSize()+len(plaintext)+b.aead.Overhead())
	out[0] = version1
	if _, err := rand.Read(out[1:]); err != nil {
		return nil, fmt.Errorf("tokencrypt: nonce: %w", err)
	}
	return b.aead.Seal(out, out[1:], plaintext, ad), nil
}

// Open decrypts what Seal produced with the same key and ad.
func (b *Box) Open(sealed, ad []byte) ([]byte, error) {
	n := b.aead.NonceSize()
	if len(sealed) < 1+n+b.aead.Overhead() || sealed[0] != version1 {
		return nil, ErrDecrypt
	}
	pt, err := b.aead.Open(nil, sealed[1:1+n], sealed[1+n:], ad)
	if err != nil {
		return nil, ErrDecrypt
	}
	return pt, nil
}
