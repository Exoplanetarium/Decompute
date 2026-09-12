//go:build linux

package autostart

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

const unitName = "decompute-agent"

func unitPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".config", "systemd", "user", unitName+".service"), nil
}

func Install(exePath string) error {
	p, err := unitPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return err
	}
	unit := fmt.Sprintf(`[Unit]
Description=Decompute provider agent

[Service]
ExecStart=%s --resume
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
`, exePath)
	if err := os.WriteFile(p, []byte(unit), 0o644); err != nil {
		return err
	}
	if err := exec.Command("systemctl", "--user", "daemon-reload").Run(); err != nil {
		return fmt.Errorf("wrote %s, but couldn't reload systemd — run 'systemctl --user daemon-reload && systemctl --user enable --now %s' yourself", p, unitName)
	}
	if err := exec.Command("systemctl", "--user", "enable", "--now", unitName).Run(); err != nil {
		return fmt.Errorf("wrote %s, but couldn't enable it — run 'systemctl --user enable --now %s' yourself", p, unitName)
	}
	return nil
}

// StartNow is a no-op — Install's `enable --now` already started the unit
// running in the background immediately.
func StartNow(exePath string) error {
	return nil
}

func Remove() error {
	_ = exec.Command("systemctl", "--user", "disable", "--now", unitName).Run()
	p, err := unitPath()
	if err != nil {
		return err
	}
	if err := os.Remove(p); err != nil && !os.IsNotExist(err) {
		return err
	}
	_ = exec.Command("systemctl", "--user", "daemon-reload").Run()
	return nil
}
