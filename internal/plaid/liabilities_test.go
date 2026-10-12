package plaid

import (
	"context"
	"testing"
)

// Shaped like Plaid's sandbox answer; all values are fake.
const liabilitiesBody = `{
	"accounts": [
		{"account_id":"card-1","name":"Plaid Credit Card","type":"credit","subtype":"credit card",
		 "balances":{"current":410,"limit":2000,"iso_currency_code":"USD"}},
		{"account_id":"coins","name":"Coins","type":"credit",
		 "balances":{"current":1,"iso_currency_code":null,"unofficial_currency_code":"BTC"}}
	],
	"liabilities": {
		"credit": [
			{"account_id":"card-1",
			 "aprs":[
				{"apr_percentage":15.24,"apr_type":"balance_transfer_apr","balance_subject_to_apr":1562.32},
				{"apr_percentage":27.95,"apr_type":"cash_apr"},
				{"apr_percentage":12.5,"apr_type":"purchase_apr"},
				{"apr_percentage":5000,"apr_type":"purchase_apr"},
				{"apr_percentage":3,"apr_type":"made_up"}
			 ],
			 "is_overdue":false,"last_payment_amount":168.25,"last_payment_date":"2026-09-22",
			 "last_statement_issue_date":"2026-09-28","last_statement_balance":1708.77,
			 "minimum_payment_amount":20,"next_payment_due_date":"2026-10-28"},
			{"account_id":"coins","aprs":[],"minimum_payment_amount":1},
			{"account_id":null}
		],
		"mortgage": [], "student": []
	}
}`

func TestLiabilities(t *testing.T) {
	c, f := setup(t, "/liabilities/get", 200, liabilitiesBody)
	cards, err := c.Liabilities(context.Background(), fakeToken)
	if err != nil {
		t.Fatal(err)
	}
	if f.lastBody["access_token"] != fakeToken {
		t.Fatalf("body = %v", f.lastBody)
	}
	// The BTC card (decimals unknown) and the one without an account are left out.
	if len(cards) != 1 {
		t.Fatalf("got %d cards: %+v", len(cards), cards)
	}
	card := cards[0]
	if card.PlaidAccountID != "card-1" || *card.MinimumMinor != 2000 || card.NextDueDate != "2026-10-28" ||
		*card.LastStatementMinor != 170877 || card.LastStatementDate != "2026-09-28" ||
		*card.LastPaymentMinor != 16825 || card.LastPaymentDate != "2026-09-22" || card.Overdue == nil || *card.Overdue {
		t.Fatalf("card = %+v", card)
	}
	// Unknown types and impossible rates are dropped; the rest kept exactly.
	want := []APR{{"balance_transfer_apr", "15.24"}, {"cash_apr", "27.95"}, {"purchase_apr", "12.5"}}
	if len(card.APRs) != len(want) {
		t.Fatalf("aprs = %+v", card.APRs)
	}
	for i := range want {
		if card.APRs[i] != want[i] {
			t.Fatalf("apr %d = %+v, want %+v", i, card.APRs[i], want[i])
		}
	}
}

func TestNoLiabilities(t *testing.T) {
	for code, want := range map[string]bool{
		"PRODUCTS_NOT_SUPPORTED": true, "NO_LIABILITY_ACCOUNTS": true, "PRODUCT_NOT_READY": true,
		"ADDITIONAL_CONSENT_REQUIRED": true, "ITEM_LOGIN_REQUIRED": false, "INTERNAL_SERVER_ERROR": false,
	} {
		c, _ := setup(t, "/liabilities/get", 400, `{"error_type":"X","error_code":"`+code+`","request_id":"r"}`)
		_, err := c.Liabilities(context.Background(), fakeToken)
		if NoLiabilities(err) != want {
			t.Errorf("%s: NoLiabilities = %v", code, !want)
		}
	}
}
