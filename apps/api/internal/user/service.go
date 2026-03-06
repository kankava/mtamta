package user

import (
	"context"
	"fmt"
)

type Service struct {
	repo *Repository
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) GetMe(ctx context.Context, userID string) (*User, error) {
	return s.repo.FindByID(ctx, userID)
}

func (s *Service) UpdateMe(ctx context.Context, userID string, fields UpdateFields) (*User, error) {
	if fields.DisplayName != nil && len(*fields.DisplayName) > 50 {
		return nil, fmt.Errorf("display_name exceeds 50 characters")
	}
	if fields.Bio != nil && len(*fields.Bio) > 500 {
		return nil, fmt.Errorf("bio exceeds 500 characters")
	}
	return s.repo.Update(ctx, userID, fields)
}
