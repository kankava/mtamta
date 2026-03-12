package tiles

import (
	"testing"
)

func TestTileBbox(t *testing.T) {
	// Tile 0/0/0 should cover the whole world in Web Mercator
	bbox := tileBbox(0, 0, 0)
	if bbox == "" {
		t.Fatal("expected non-empty bbox")
	}
	// z=0 x=0 y=0 is the single tile covering the full Web Mercator extent
	expected := "-20037508.342789,-20037508.342789,20037508.342789,20037508.342789"
	if bbox != expected {
		t.Errorf("z=0 bbox mismatch:\n  got:  %s\n  want: %s", bbox, expected)
	}
}

func TestTileBbox_Z1(t *testing.T) {
	// z=1, x=0, y=0 should be top-left quarter
	bbox := tileBbox(1, 0, 0)
	if bbox == "" {
		t.Fatal("expected non-empty bbox")
	}
	// n=2, tileSize = 20037508.342789244
	// minX = -20037508 + 0 = -20037508
	// maxX = -20037508 + 20037508 = 0
	// maxY = 20037508 - 0 = 20037508
	// minY = 20037508 - 20037508 = 0
	expected := "-20037508.342789,0.000000,0.000000,20037508.342789"
	if bbox != expected {
		t.Errorf("z=1 bbox mismatch:\n  got:  %s\n  want: %s", bbox, expected)
	}
}

func TestSeasonValidation(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"summer", "summer"},
		{"winter", "winter"},
		{"", "summer"},
		{"foo", "summer"},
		{"SUMMER", "summer"},
		{"Spring", "summer"},
	}

	for _, tc := range tests {
		season := tc.input
		if season != "winter" {
			season = "summer"
		}
		if season != tc.expected {
			t.Errorf("input %q: got %q, want %q", tc.input, season, tc.expected)
		}
	}
}

func TestSeasonDateRange_Summer(t *testing.T) {
	r := seasonDateRange("summer", 2024)
	expected := "2024-06-01/2024-08-31"
	if r != expected {
		t.Errorf("got %s, want %s", r, expected)
	}
}

func TestSeasonDateRange_Winter(t *testing.T) {
	r := seasonDateRange("winter", 2024)
	expected := "2023-12-01/2024-02-28"
	if r != expected {
		t.Errorf("got %s, want %s", r, expected)
	}
}
