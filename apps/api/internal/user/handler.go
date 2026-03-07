package user

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/kankava/mtamta/internal/middleware"
	"github.com/kankava/mtamta/internal/respond"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

type updateMeRequest struct {
	DisplayName *string `json:"display_name"`
	Bio         *string `json:"bio"`
	AvatarURL   *string `json:"avatar_url"`
}

func (h *Handler) GetMe(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	u, err := h.service.GetMe(r.Context(), userID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			respond.Error(w, http.StatusNotFound, "NOT_FOUND", "user not found")
			return
		}
		respond.Error(w, http.StatusInternalServerError, "SERVER_ERROR", "failed to fetch user")
		return
	}
	respond.JSON(w, http.StatusOK, toResponse(u))
}

func (h *Handler) UpdateMe(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	var req updateMeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respond.Error(w, http.StatusBadRequest, "INVALID_REQUEST", "invalid JSON body")
		return
	}

	fields := UpdateFields(req)

	u, err := h.service.UpdateMe(r.Context(), userID, fields)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			respond.Error(w, http.StatusNotFound, "NOT_FOUND", "user not found")
			return
		}
		respond.Error(w, http.StatusBadRequest, "INVALID_REQUEST", err.Error())
		return
	}
	respond.JSON(w, http.StatusOK, toResponse(u))
}

type userResponse struct {
	ID          string  `json:"id"`
	DisplayName string  `json:"display_name"`
	Email       *string `json:"email"`
	AvatarURL   *string `json:"avatar_url"`
	Bio         *string `json:"bio"`
	CreatedAt   string  `json:"created_at"`
	UpdatedAt   string  `json:"updated_at"`
}

func toResponse(u *User) userResponse {
	return userResponse{
		ID:          u.ID,
		DisplayName: u.DisplayName,
		Email:       u.Email,
		AvatarURL:   u.AvatarURL,
		Bio:         u.Bio,
		CreatedAt:   u.CreatedAt.UTC().Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt:   u.UpdatedAt.UTC().Format("2006-01-02T15:04:05Z07:00"),
	}
}
