package tiles

import (
	"time"

	"github.com/kankava/mtamta/internal/config"
)

// Provider defines an upstream tile source that the proxy can fetch from.
type Provider struct {
	ID             string
	UpstreamURL    string            // Go template with %d for z, x, y
	FormatOrder    string            // "zxy" or "zyx" — order of Sprintf args (default "zxy")
	CacheTTL       time.Duration     // Redis cache duration
	CachePrefix    string            // Redis key prefix
	Headers        map[string]string // Extra headers for upstream requests
	BlankThreshold int               // If > 0, tiles with body ≤ this size are treated as blank (return 204)
	RateLimit      int               // Max upstream fetches per minute (0 = use default)
}

// BuildProviders creates the provider registry from config.
// Only providers whose dependencies (API keys etc.) are satisfied are registered.
func BuildProviders(cfg *config.Config) map[string]*Provider {
	providers := make(map[string]*Provider)

	// OpenTopoMap — rate-limited, needs proxy with User-Agent
	providers["opentopomap"] = &Provider{
		ID:          "opentopomap",
		UpstreamURL: "https://tile.opentopomap.org/%d/%d/%d.png",
		FormatOrder: "zxy",
		CacheTTL:    24 * time.Hour,
		CachePrefix: "tile:otm",
		Headers: map[string]string{
			"User-Agent": "mtamta/1.0 (tile-proxy)",
		},
	}

	// swisstopo — proxy to filter blank border tiles.
	// Blank JPEGs are ~668 bytes; smallest real tile observed is ~24KB.
	// Threshold of 1000 bytes is well within the gap.
	providers["swisstopo"] = &Provider{
		ID:             "swisstopo",
		UpstreamURL:    "https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/%d/%d/%d.jpeg",
		FormatOrder:    "zxy",
		CacheTTL:       24 * time.Hour,
		CachePrefix:    "tile:swisstopo",
		Headers:        map[string]string{},
		BlankThreshold: 1000,
		RateLimit:      2000,
	}

	// swisstopo winter — the official "winter representation" national map
	// (ch.swisstopo.pixelkarte-farbe-winter), not the plain grayscale map.
	providers["swisstopo-winter"] = &Provider{
		ID:             "swisstopo-winter",
		UpstreamURL:    "https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe-winter/default/current/3857/%d/%d/%d.jpeg",
		FormatOrder:    "zxy",
		CacheTTL:       24 * time.Hour,
		CachePrefix:    "tile:swisstopo-w",
		Headers:        map[string]string{},
		BlankThreshold: 1000,
		RateLimit:      2000,
	}

	// IGN France is not proxied — the public Géoplateforme PLANIGNV2 WMTS
	// endpoint is open access (no API key), so the web app loads it directly.

	return providers
}
