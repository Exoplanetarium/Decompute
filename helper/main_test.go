package main

import "testing"

func TestSplitCodeAndHost(t *testing.T) {
	cases := []struct {
		name     string
		input    string
		wantCode string
		wantBase string
	}{
		{"bare code keeps default", "E5BC7BD1", "E5BC7BD1", ""},
		{"localhost gets http", "E5BC7BD1@localhost:3000", "E5BC7BD1", "http://localhost:3000"},
		{"loopback ip gets http", "E5BC7BD1@127.0.0.1:3000", "E5BC7BD1", "http://127.0.0.1:3000"},
		{"private lan ip gets http", "E5BC7BD1@192.168.0.113:3000", "E5BC7BD1", "http://192.168.0.113:3000"},
		{"public host gets https", "E5BC7BD1@api.decompute.io", "E5BC7BD1", "https://api.decompute.io"},
		{"explicit scheme respected", "E5BC7BD1@http://staging.example.com", "E5BC7BD1", "http://staging.example.com"},
		{"explicit https respected", "E5BC7BD1@https://api.decompute.io", "E5BC7BD1", "https://api.decompute.io"},
		{"trailing slash trimmed", "E5BC7BD1@http://localhost:3000/", "E5BC7BD1", "http://localhost:3000"},
		{"empty host falls back to default", "E5BC7BD1@", "E5BC7BD1", ""},
		{"surrounding spaces tolerated", " E5BC7BD1 @ localhost:3000 ", "E5BC7BD1", "http://localhost:3000"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			code, base := splitCodeAndHost(tc.input)
			if code != tc.wantCode {
				t.Errorf("code = %q, want %q", code, tc.wantCode)
			}
			if base != tc.wantBase {
				t.Errorf("apiBase = %q, want %q", base, tc.wantBase)
			}
		})
	}
}
