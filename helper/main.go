package main

import (
	"bufio"
	"flag"
	"fmt"
	"net"
	"os"
	"runtime"
	"strings"

	"github.com/decompute/helper/internal/agent"
	"github.com/decompute/helper/internal/client"
	"github.com/decompute/helper/internal/detect"
)

// Overridden at build time via -ldflags "-X main.defaultAPIBase=...".
var defaultAPIBase = "http://localhost:3000"

func main() {
	code := flag.String("code", "", "Pairing code shown in your Decompute browser tab")
	apiBase := flag.String("api-base", defaultAPIBase, "Decompute API base URL")
	agentToken := flag.String("agent-token", "", "Run as a resident job-execution agent using this node's agent token (from the listing page), instead of one-shot hardware detection")
	flag.Parse()

	if *agentToken != "" {
		os.Exit(runAgent(*apiBase, *agentToken))
	}

	exitCode := run(*code, *apiBase)
	pauseIfInteractive()
	os.Exit(exitCode)
}

func runAgent(apiBase, token string) int {
	if runtime.GOOS == "darwin" {
		fmt.Println("Job execution isn't supported on macOS yet — this node can still be listed, it just won't receive jobs.")
		return 1
	}
	return agent.Run(apiBase, token)
}

func run(codeFlag, apiBase string) int {
	pairingCode := strings.TrimSpace(codeFlag)
	if pairingCode == "" {
		fmt.Print("Enter the pairing code shown in your browser: ")
		reader := bufio.NewReader(os.Stdin)
		line, _ := reader.ReadString('\n')
		pairingCode = strings.TrimSpace(line)
	}
	if pairingCode == "" {
		fmt.Println("No pairing code provided.")
		return 1
	}

	// A code may carry the server that minted it, as CODE@host[:port]. A
	// typed-in code otherwise has no way to say where it came from, so
	// without this the binary could only ever report to the build-time
	// default — meaning the no-terminal flow worked in production only.
	// The embedded host wins over --api-base: a code is only ever valid on
	// the server that issued it.
	pairingCode, embeddedBase := splitCodeAndHost(pairingCode)
	if embeddedBase != "" {
		apiBase = embeddedBase
	}

	fmt.Printf("Reporting to %s\n", apiBase)
	fmt.Println("Detecting your hardware...")
	spec := detect.Detect()

	fmt.Printf("  GPU: %d x %s (%.1f GB VRAM)\n", spec.GPUCount, spec.GPUModel, spec.VRAMGB)
	fmt.Printf("  RAM: %.1f GB\n", spec.RAMGB)
	fmt.Printf("  CPU: %s (%d cores)\n", spec.CPUModel, spec.CPUCores)

	if err := client.ReportSpec(apiBase, pairingCode, spec); err != nil {
		if err == client.ErrInvalidCode {
			fmt.Println("This pairing code is invalid or has expired. Go back to the browser, generate a new one, and try again.")
		} else {
			fmt.Println(err.Error())
		}
		return 1
	}

	fmt.Println("Done! Go back to your browser to finish setting up your listing.")
	return 0
}

// splitCodeAndHost parses "CODE@host[:port]" into the bare code and an API
// base URL, so a code pasted from a non-production browser session knows
// where to report. A plain code returns an empty base, leaving whatever
// --api-base (or the build-time default) supplied.
//
// The scheme may be given explicitly ("CODE@http://host:3000"); otherwise
// loopback and private-network addresses get http, everything else https,
// matching how these addresses are actually served.
func splitCodeAndHost(input string) (code, apiBase string) {
	at := strings.Index(input, "@")
	if at < 0 {
		return input, ""
	}
	code = strings.TrimSpace(input[:at])
	host := strings.TrimSpace(input[at+1:])
	if host == "" {
		return code, ""
	}
	if strings.HasPrefix(host, "http://") || strings.HasPrefix(host, "https://") {
		return code, strings.TrimSuffix(host, "/")
	}
	scheme := "https://"
	if isLocalOrPrivate(host) {
		scheme = "http://"
	}
	return code, scheme + strings.TrimSuffix(host, "/")
}

func isLocalOrPrivate(host string) bool {
	h := host
	if i := strings.Index(h, ":"); i >= 0 {
		h = h[:i]
	}
	h = strings.ToLower(h)
	if h == "localhost" || h == "::1" || strings.HasSuffix(h, ".local") {
		return true
	}
	ip := net.ParseIP(h)
	return ip != nil && (ip.IsLoopback() || ip.IsPrivate())
}

// Windows (and double-clicked launches generally) close the console the
// instant the process exits, before someone unfamiliar with terminals can
// read the result — that's what made a real failure look like nothing
// happened. Pause only when stdin is a real interactive terminal; piped or
// redirected stdin (scripts, this binary invoked from other tooling) skips
// the pause so automation never hangs waiting for a keypress.
func pauseIfInteractive() {
	fi, err := os.Stdin.Stat()
	if err != nil || fi.Mode()&os.ModeCharDevice == 0 {
		return
	}
	fmt.Print("\nPress Enter to close this window...")
	bufio.NewReader(os.Stdin).ReadString('\n')
}
