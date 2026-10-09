// Package money converts amounts to whole minor units (cents, pence, yen...),
// the way Tallyn stores money: bigint next to a currency code (migrations/0002).
// Never use floats for money.
package money

import (
	"errors"
	"fmt"
	"math"
	"math/big"
	"strings"
)

// ISO 4217 currencies whose minor unit isn't 2 decimal places.
var exponents = map[string]int{
	"BIF": 0, "CLP": 0, "DJF": 0, "GNF": 0, "ISK": 0, "JPY": 0, "KMF": 0, "KRW": 0,
	"PYG": 0, "RWF": 0, "UGX": 0, "UYI": 0, "VND": 0, "VUV": 0, "XAF": 0, "XOF": 0, "XPF": 0,
	"BHD": 3, "IQD": 3, "JOD": 3, "KWD": 3, "LYD": 3, "OMR": 3, "TND": 3,
	"CLF": 4, "UYW": 4,
}

// Exponent returns the number of minor-unit decimal places for an ISO 4217
// code. Codes it doesn't know as ISO (e.g. Plaid's unofficial crypto codes)
// return ok = false.
func Exponent(currency string) (exp int, ok bool) {
	c := strings.ToUpper(currency)
	if len(c) != 3 || strings.Trim(c, "ABCDEFGHIJKLMNOPQRSTUVWXYZ") != "" {
		return 0, false
	}
	if e, found := exponents[c]; found {
		return e, true
	}
	return 2, true
}

// ErrUnknownCurrency means ToMinor can't tell how many decimals the currency has.
var ErrUnknownCurrency = errors.New("money: unknown currency")

// ToMinor converts a decimal amount, given as text exactly as it arrived
// (e.g. a JSON number "1234.56"), to minor units of currency. Extra decimals
// are rounded half away from zero. The text is parsed exactly: no floats.
func ToMinor(amount, currency string) (int64, error) {
	exp, ok := Exponent(currency)
	if !ok {
		return 0, ErrUnknownCurrency
	}
	r, ok := new(big.Rat).SetString(amount)
	if !ok {
		return 0, fmt.Errorf("money: %q is not a number", amount)
	}
	r.Mul(r, new(big.Rat).SetInt(new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(exp)), nil)))

	// Round half away from zero: |n|/d, plus one if the remainder is at least half.
	num := new(big.Int).Abs(r.Num())
	q, rem := new(big.Int).QuoRem(num, r.Denom(), new(big.Int))
	if rem.Lsh(rem, 1).Cmp(r.Denom()) >= 0 {
		q.Add(q, big.NewInt(1))
	}
	if r.Sign() < 0 {
		q.Neg(q)
	}
	if !q.IsInt64() || q.Int64() == math.MinInt64 {
		return 0, fmt.Errorf("money: %q is out of range", amount)
	}
	return q.Int64(), nil
}
