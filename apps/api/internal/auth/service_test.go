package auth

import (
	"fmt"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
)

func TestIsDuplicateEmail(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{
			name: "users_email_key violation",
			err:  &pgconn.PgError{Code: "23505", ConstraintName: "users_email_key"},
			want: true,
		},
		{
			name: "auth_providers unique violation",
			err:  &pgconn.PgError{Code: "23505", ConstraintName: "auth_providers_provider_provider_uid_key"},
			want: false,
		},
		{
			name: "non-23505 error",
			err:  &pgconn.PgError{Code: "42P01", ConstraintName: "users_email_key"},
			want: false,
		},
		{
			name: "non-pg error",
			err:  fmt.Errorf("some other error"),
			want: false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isDuplicateEmail(tt.err); got != tt.want {
				t.Errorf("isDuplicateEmail() = %v, want %v", got, tt.want)
			}
		})
	}
}
