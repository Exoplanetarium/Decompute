// Package config persists the resident agent's resolved credential locally,
// so redeeming a one-time enrollment code is a one-time action — every
// later run of --start with no code just reuses what's saved here.
package config

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
)

type AgentConfig struct {
	NodeID  string `json:"nodeId"`
	Secret  string `json:"secret"`
	APIBase string `json:"apiBase"`
}

func path() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "decompute", "agent.json"), nil
}

func Load() (AgentConfig, error) {
	p, err := path()
	if err != nil {
		return AgentConfig{}, err
	}
	data, err := os.ReadFile(p)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return AgentConfig{}, errors.New("no saved setup found — run with a code from the website first")
		}
		return AgentConfig{}, err
	}
	var cfg AgentConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return AgentConfig{}, err
	}
	return cfg, nil
}

// Save writes the resolved credential with owner-only permissions — this
// file is as sensitive as the token it holds.
func Save(cfg AgentConfig) error {
	p, err := path()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(p), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(p, data, 0o600)
}
