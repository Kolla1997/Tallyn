package db

import (
	"context"
	"testing"
)

// Product news (#281). All data is fake.
func TestNews(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	if n, err := f.db.News(ctx, alice); err != nil || n.Set || n.On {
		t.Fatalf("before any choice = %+v, %v", n, err)
	}
	if err := f.db.SetNews(ctx, alice, true, NewsSignup, "0.2-draft"); err != nil {
		t.Fatal(err)
	}
	if err := f.db.SetNews(ctx, alice, false, NewsStopLink, "0.2-draft"); err != nil {
		t.Fatal(err)
	}
	if n, _ := f.db.News(ctx, alice); !n.Set || n.On || n.ChangedAt == nil {
		t.Errorf("after stop link = %+v", n)
	}
	var rows int
	_ = f.admin.QueryRow(ctx, `select count(*) from news_choices where user_id = $1`, alice).Scan(&rows)
	if rows != 2 {
		t.Errorf("%d rows: every change must be kept", rows)
	}
	if err := f.db.SetNews(ctx, alice, true, "email", "x"); err != ErrInvalid {
		t.Errorf("unknown source: %v", err)
	}

	t.Run("only your own", func(t *testing.T) {
		if n, _ := f.db.News(ctx, bob); n.Set {
			t.Error("bob sees alice's choice")
		}
		for name, sql := range map[string]string{
			"insert for alice": `insert into news_choices (user_id, subscribed, source, privacy_version) values ('` + alice + `', true, 'settings', 'x')`,
			"edit own":         `update news_choices set subscribed = true where user_id = '` + bob + `'`,
			"delete own":       `delete from news_choices where user_id = '` + bob + `'`,
		} {
			if n, err := f.execAs(bob, sql); err == nil && n > 0 {
				t.Errorf("%s: allowed", name)
			}
		}
	})

	t.Run("the newsletter list", func(t *testing.T) {
		if err := f.db.SetNews(ctx, bob, true, NewsSettings, "0.2-draft"); err != nil {
			t.Fatal(err)
		}
		list, err := f.sys.NewsList(ctx)
		if err != nil {
			t.Fatal(err)
		}
		if len(list) != 1 || list[0].UserID != bob || list[0].Email == "" {
			t.Errorf("list = %+v: only bob said yes last", list)
		}
	})
}
