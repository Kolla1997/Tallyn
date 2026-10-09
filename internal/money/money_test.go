package money

import (
	"errors"
	"testing"
)

func TestToMinor(t *testing.T) {
	for _, tc := range []struct {
		amount, cur string
		want        int64
	}{
		{"1234.56", "USD", 123456},
		{"0", "USD", 0},
		{"110", "USD", 11000},
		{"0.1", "USD", 10},
		{"-500.25", "USD", -50025}, // credit balances and refunds can be negative
		{"0.005", "USD", 1},        // half rounds away from zero
		{"-0.005", "USD", -1},
		{"0.0049", "USD", 0},
		{"1.5e3", "USD", 150000},
		{"4210", "usd", 421000},
		{"1234", "JPY", 1234},
		{"1234.5", "JPY", 1235},
		{"1.234", "KWD", 1234},
		{"3970.00", "EUR", 397000},
		{"0.30000000000000004", "USD", 30}, // what float noise looks like; still exact
		{"92233720368547758.07", "USD", 9223372036854775807},
	} {
		got, err := ToMinor(tc.amount, tc.cur)
		if err != nil || got != tc.want {
			t.Errorf("ToMinor(%q, %q) = %d, %v; want %d", tc.amount, tc.cur, got, err, tc.want)
		}
	}
}

func TestToMinorRejects(t *testing.T) {
	for _, tc := range []struct{ amount, cur string }{
		{"abc", "USD"},
		{"", "USD"},
		{"1.0", "BTC1"},
		{"1.0", "US"},
		{"1.0", ""},
		{"92233720368547758.08", "USD"},
		{"1e400", "USD"},
	} {
		if got, err := ToMinor(tc.amount, tc.cur); err == nil {
			t.Errorf("ToMinor(%q, %q) = %d, want an error", tc.amount, tc.cur, got)
		}
	}
	if _, err := ToMinor("1", "DOGE"); !errors.Is(err, ErrUnknownCurrency) {
		t.Errorf("DOGE: err = %v, want ErrUnknownCurrency", err)
	}
}

func TestExponent(t *testing.T) {
	for cur, want := range map[string]int{"USD": 2, "JPY": 0, "KWD": 3, "CLF": 4, "gbp": 2} {
		if got, ok := Exponent(cur); !ok || got != want {
			t.Errorf("Exponent(%q) = %d, %v; want %d", cur, got, ok, want)
		}
	}
	if _, ok := Exponent("DOGE"); ok {
		t.Error("Exponent(DOGE) should be unknown")
	}
}
