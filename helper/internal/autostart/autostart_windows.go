//go:build windows

// Package autostart installs a per-user launcher so the resident agent
// resumes automatically at login — no admin rights, no Windows service,
// fully reversible by calling Remove.
package autostart

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
)

func startupPath() (string, error) {
	appData := os.Getenv("APPDATA")
	if appData == "" {
		return "", fmt.Errorf("could not find your Windows Startup folder")
	}
	return filepath.Join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "decompute-agent.bat"), nil
}

func pidPath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "decompute", "agent.pid"), nil
}

func Install(exePath string) error {
	p, err := startupPath()
	if err != nil {
		return err
	}
	script := fmt.Sprintf("@echo off\r\nstart \"\" \"%s\" --resume\r\n", exePath)
	return os.WriteFile(p, []byte(script), 0o644)
}

// StartNow launches the agent as a hidden, detached process — the Startup
// folder entry from Install only takes effect on the *next* login, so this
// is what makes closing the current window safe right away.
func StartNow(exePath string) error {
	cmd := exec.Command(exePath, "--resume")
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	if err := cmd.Start(); err != nil {
		return err
	}
	if p, err := pidPath(); err == nil {
		_ = os.WriteFile(p, []byte(strconv.Itoa(cmd.Process.Pid)), 0o600)
	}
	return nil
}

func Remove() error {
	if p, err := pidPath(); err == nil {
		if data, readErr := os.ReadFile(p); readErr == nil {
			if pid, convErr := strconv.Atoi(strings.TrimSpace(string(data))); convErr == nil {
				_ = exec.Command("taskkill", "/PID", strconv.Itoa(pid), "/F").Run()
			}
			_ = os.Remove(p)
		}
	}

	p, err := startupPath()
	if err != nil {
		return err
	}
	if err := os.Remove(p); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}
