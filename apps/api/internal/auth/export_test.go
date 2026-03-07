package auth

// Export test helpers for use by auth_test (black-box) package.
var (
	GenerateTestRSAKey = generateTestRSAKey
	SignGoogleToken    = signGoogleToken
)
