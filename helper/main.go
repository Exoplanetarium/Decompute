package main

import (
	"bufio"
	"flag"
	"fmt"
	"os"
	"strings"

	"github.com/decompute/helper/internal/client"
	"github.com/decompute/helper/internal/detect"
)

// Overridden at build time via -ldflags "-X main.defaultAPIBase=...".
var defaultAPIBase = "http://localhost:3000"

func main() {
	code := flag.String("code", "", "Pairing code shown in your Decompute browser tab")
	apiBase := flag.String("api-base", defaultAPIBase, "Decompute API base URL")
	flag.Parse()

	pairingCode := strings.TrimSpace(*code)
	if pairingCode == "" {
		fmt.Print("Enter the pairing code shown in your browser: ")
		reader := bufio.NewReader(os.Stdin)
		line, _ := reader.ReadString('\n')
		pairingCode = strings.TrimSpace(line)
	}
	if pairingCode == "" {
		fmt.Println("No pairing code provided.")
		os.Exit(1)
	}

	fmt.Println("Detecting your hardware...")
	spec := detect.Detect()

	fmt.Printf("  GPU: %d x %s (%.1f GB VRAM)\n", spec.GPUCount, spec.GPUModel, spec.VRAMGB)
	fmt.Printf("  RAM: %.1f GB\n", spec.RAMGB)
	fmt.Printf("  CPU: %s (%d cores)\n", spec.CPUModel, spec.CPUCores)

	if err := client.ReportSpec(*apiBase, pairingCode, spec); err != nil {
		if err == client.ErrInvalidCode {
			fmt.Println("This pairing code is invalid or has expired. Go back to the browser, generate a new one, and re-run this command.")
		} else {
			fmt.Println(err.Error())
		}
		os.Exit(1)
	}

	fmt.Println("Done! Go back to your browser to finish setting up your listing.")
}
