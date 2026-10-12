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
		{"account_id":"loan-1","name":"Plaid Student Loan","type":"loan","subtype":"student",
		 "balances":{"current":65262,"iso_currency_code":"USD"}},
		{"account_id":"home-1","name":"Plaid Mortgage","type":"loan","subtype":"mortgage",
		 "balances":{"current":56302.06,"iso_currency_code":"USD"}},
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
		"student": [
			{"account_id":"loan-1","account_number":"4277075694","interest_rate_percentage":5.25,
			 "minimum_payment_amount":25,"next_payment_due_date":"2026-11-01","last_payment_amount":138.05,
			 "last_payment_date":"2026-10-01","expected_payoff_date":"2032-07-28","origination_principal_amount":105000,
			 "origination_date":"2015-08-01","is_overdue":false,"ytd_interest_paid":280.55,"ytd_principal_paid":271.65,
			 "repayment_plan":{"description":"Standard Repayment","type":"standard"},
			 "servicer_address":{"street":"123 Fake St"},"payment_reference_number":"4277075694"}
		],
		"mortgage": [
			{"account_id":"home-1","account_number":"3120194154","interest_rate":{"percentage":3.99,"type":"fixed"},
			 "next_monthly_payment":3141.54,"next_payment_due_date":"2026-11-01","maturity_date":"2045-07-31",
			 "origination_principal_amount":300000,"origination_date":"2015-07-31","past_due_amount":2304,
			 "ytd_interest_paid":12300.4,"ytd_principal_paid":12340.5,"loan_term":"30 year",
			 "property_address":{"street":"2992 Cameron Road"},"escrow_balance":3141.54,"has_pmi":true},
			{"account_id":"home-1","interest_rate":{"percentage":99999,"type":"weird"},"loan_term":"\u0007bad"}
		]
	}
}`

func TestLiabilities(t *testing.T) {
	c, f := setup(t, "/liabilities/get", 200, liabilitiesBody)
	res, err := c.Liabilities(context.Background(), fakeToken)
	if err != nil {
		t.Fatal(err)
	}
	cards := res.Cards
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

// Loans (#27): only the fields Tallyn shows; implausible values dropped;
// a mortgage with an amount past due counts as overdue.
func TestLiabilityLoans(t *testing.T) {
	c, _ := setup(t, "/liabilities/get", 200, liabilitiesBody)
	res, err := c.Liabilities(context.Background(), fakeToken)
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Loans) != 3 {
		t.Fatalf("got %d loans: %+v", len(res.Loans), res.Loans)
	}
	st := res.Loans[0]
	if st.Kind != "student" || st.RatePercent != "5.25" || *st.NextPaymentMinor != 2500 || st.NextDueDate != "2026-11-01" ||
		st.PayoffDate != "2032-07-28" || *st.OriginalMinor != 10500000 || *st.YTDInterestMinor != 28055 ||
		st.RepaymentPlan != "Standard Repayment" || st.Overdue == nil || *st.Overdue {
		t.Fatalf("student = %+v", st)
	}
	m := res.Loans[1]
	if m.Kind != "mortgage" || m.RatePercent != "3.99" || m.RateType != "fixed" || *m.NextPaymentMinor != 314154 ||
		m.PayoffDate != "2045-07-31" || *m.OriginalMinor != 30000000 || *m.PastDueMinor != 230400 ||
		m.Overdue == nil || !*m.Overdue || m.Term != "30 year" {
		t.Fatalf("mortgage = %+v", m)
	}
	odd := res.Loans[2]
	if odd.RatePercent != "" || odd.RateType != "" || odd.Term != "" {
		t.Fatalf("implausible values kept: %+v", odd)
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
