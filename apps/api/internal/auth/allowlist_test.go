package auth

import "testing"

func TestIsEmailAllowed(t *testing.T) {
	t.Run("empty allowlist allows everyone", func(t *testing.T) {
		svc := NewService(nil, nil, "", nil, nil, nil)
		if !svc.IsEmailAllowed("anyone@example.com") {
			t.Fatal("expected empty allowlist to allow all emails")
		}
	})

	t.Run("allowlist blocks unlisted email", func(t *testing.T) {
		svc := NewService(nil, nil, "", nil, nil, []string{"owner@gmail.com"})
		if svc.IsEmailAllowed("stranger@gmail.com") {
			t.Fatal("expected unlisted email to be blocked")
		}
	})

	t.Run("allowlist permits listed email", func(t *testing.T) {
		svc := NewService(nil, nil, "", nil, nil, []string{"owner@gmail.com"})
		if !svc.IsEmailAllowed("owner@gmail.com") {
			t.Fatal("expected listed email to be allowed")
		}
	})

	t.Run("case insensitive", func(t *testing.T) {
		svc := NewService(nil, nil, "", nil, nil, []string{"Owner@Gmail.COM"})
		if !svc.IsEmailAllowed("owner@gmail.com") {
			t.Fatal("expected case-insensitive match")
		}
	})

	t.Run("trims whitespace", func(t *testing.T) {
		svc := NewService(nil, nil, "", nil, nil, []string{"  owner@gmail.com  "})
		if !svc.IsEmailAllowed("owner@gmail.com") {
			t.Fatal("expected whitespace-trimmed match")
		}
	})

	t.Run("multiple emails", func(t *testing.T) {
		svc := NewService(nil, nil, "", nil, nil, []string{"a@x.com", "b@x.com"})
		if !svc.IsEmailAllowed("b@x.com") {
			t.Fatal("expected second email to be allowed")
		}
		if svc.IsEmailAllowed("c@x.com") {
			t.Fatal("expected unlisted email to be blocked")
		}
	})

	t.Run("empty strings in allowlist are ignored", func(t *testing.T) {
		svc := NewService(nil, nil, "", nil, nil, []string{"", "  ", "owner@gmail.com"})
		if !svc.IsEmailAllowed("owner@gmail.com") {
			t.Fatal("expected listed email to be allowed")
		}
		if svc.IsEmailAllowed("") {
			t.Fatal("expected empty email to be blocked")
		}
	})
}
