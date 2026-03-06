package user

import "time"

type User struct {
	ID          string
	DisplayName string
	Email       *string
	AvatarURL   *string
	Bio         *string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}
