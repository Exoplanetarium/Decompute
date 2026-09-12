//go:build !windows && !linux

package autostart

import "errors"

func Install(exePath string) error {
	return errors.New("automatic startup isn't supported on this OS yet")
}

func StartNow(exePath string) error {
	return errors.New("automatic startup isn't supported on this OS yet")
}

func Remove() error {
	return errors.New("automatic startup isn't supported on this OS yet")
}
