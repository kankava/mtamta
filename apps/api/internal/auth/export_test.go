package auth

// Export test helpers for use by auth_test (black-box) package.
var (
	GenerateTestRSAKey = generateTestRSAKey
	SignGoogleToken    = signGoogleToken
)

// IsEmailAllowed exposes isEmailAllowed for unit testing.
func (s *Service) IsEmailAllowed(email string) bool {
	return s.isEmailAllowed(email)
}
