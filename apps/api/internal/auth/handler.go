package auth

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/kankava/mtamta/internal/respond"
	"github.com/kankava/mtamta/internal/user"
)

type Handler struct {
	service *Service
	isProd  bool
}

func NewHandler(service *Service, isProd bool) *Handler {
	return &Handler{service: service, isProd: isProd}
}

type signInRequest struct {
	IDToken string `json:"id_token"`
}

type authResponse struct {
	AccessToken string    `json:"access_token"`
	User        *userJSON `json:"user"`
}

type refreshResponse struct {
	AccessToken string `json:"access_token"`
}

type userJSON struct {
	ID          string  `json:"id"`
	DisplayName string  `json:"display_name"`
	Email       *string `json:"email"`
	AvatarURL   *string `json:"avatar_url"`
	Bio         *string `json:"bio"`
	CreatedAt   string  `json:"created_at"`
	UpdatedAt   string  `json:"updated_at"`
}

func toUserJSON(u *user.User) *userJSON {
	return &userJSON{
		ID:          u.ID,
		DisplayName: u.DisplayName,
		Email:       u.Email,
		AvatarURL:   u.AvatarURL,
		Bio:         u.Bio,
		CreatedAt:   u.CreatedAt.UTC().Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt:   u.UpdatedAt.UTC().Format("2006-01-02T15:04:05Z07:00"),
	}
}

func (h *Handler) Google(w http.ResponseWriter, r *http.Request) {
	var req signInRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.IDToken == "" {
		respond.Error(w, http.StatusBadRequest, "INVALID_REQUEST", "id_token is required")
		return
	}

	result, err := h.service.SignInWithGoogle(r.Context(), req.IDToken)
	if err != nil {
		if errors.Is(err, ErrSignUpDisabled) {
			respond.Error(w, http.StatusForbidden, "SIGNUP_DISABLED", "sign-up is restricted")
			return
		}
		if errors.Is(err, ErrEmailAlreadyExists) {
			respond.Error(w, http.StatusConflict, "EMAIL_EXISTS", "email already associated with another account")
			return
		}
		respond.Error(w, http.StatusUnauthorized, "AUTH_FAILED", "authentication failed")
		return
	}

	setRefreshCookie(w, result.RefreshToken, h.isProd)
	respond.JSON(w, http.StatusOK, authResponse{
		AccessToken: result.AccessToken,
		User:        toUserJSON(result.User),
	})
}

func (h *Handler) Apple(w http.ResponseWriter, r *http.Request) {
	var req signInRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.IDToken == "" {
		respond.Error(w, http.StatusBadRequest, "INVALID_REQUEST", "id_token is required")
		return
	}

	result, err := h.service.SignInWithApple(r.Context(), req.IDToken)
	if err != nil {
		if errors.Is(err, ErrSignUpDisabled) {
			respond.Error(w, http.StatusForbidden, "SIGNUP_DISABLED", "sign-up is restricted")
			return
		}
		if errors.Is(err, ErrEmailAlreadyExists) {
			respond.Error(w, http.StatusConflict, "EMAIL_EXISTS", "email already associated with another account")
			return
		}
		respond.Error(w, http.StatusUnauthorized, "AUTH_FAILED", "authentication failed")
		return
	}

	setRefreshCookie(w, result.RefreshToken, h.isProd)
	respond.JSON(w, http.StatusOK, authResponse{
		AccessToken: result.AccessToken,
		User:        toUserJSON(result.User),
	})
}

func (h *Handler) Refresh(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("refresh_token")
	if err != nil {
		respond.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing refresh token cookie")
		return
	}

	result, err := h.service.Refresh(r.Context(), cookie.Value)
	if err != nil {
		respond.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid or expired refresh token")
		return
	}

	setRefreshCookie(w, result.RefreshToken, h.isProd)
	respond.JSON(w, http.StatusOK, refreshResponse{AccessToken: result.AccessToken})
}

func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("refresh_token")
	if err == nil {
		_ = h.service.Logout(r.Context(), cookie.Value)
	}
	clearRefreshCookie(w)
	w.WriteHeader(http.StatusNoContent)
}

func setRefreshCookie(w http.ResponseWriter, token string, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     "refresh_token",
		Value:    token,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
		Path:     "/api/v1/auth",
		MaxAge:   30 * 24 * 60 * 60,
	})
}

func clearRefreshCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     "refresh_token",
		HttpOnly: true,
		Path:     "/api/v1/auth",
		MaxAge:   -1,
	})
}
