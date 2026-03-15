package tiles

import (
	"fmt"
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

	// swisstopo winter (grayscale variant) — same blank tile characteristics
	providers["swisstopo-winter"] = &Provider{
		ID:             "swisstopo-winter",
		UpstreamURL:    "https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-grau/default/current/3857/%d/%d/%d.jpeg",
		FormatOrder:    "zxy",
		CacheTTL:       24 * time.Hour,
		CachePrefix:    "tile:swisstopo-w",
		Headers:        map[string]string{},
		BlankThreshold: 1000,
		RateLimit:      2000,
	}

	// IGN France — needs API key (WMTS uses TILEMATRIX/TILEROW/TILECOL = z/y/x)
	if cfg.IGNApiKey != "" {
		providers["ign"] = &Provider{
			ID:          "ign",
			UpstreamURL: fmt.Sprintf("https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX=%%d&TILEROW=%%d&TILECOL=%%d&apikey=%s", cfg.IGNApiKey),
			FormatOrder: "zyx",
			CacheTTL:    24 * time.Hour,
			CachePrefix: "tile:ign",
			Headers:     map[string]string{},
		}
	}

	return providers
}
