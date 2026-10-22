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
	"github.com/decompute/helper/internal/autostart"
	"github.com/decompute/helper/internal/client"
	"github.com/decompute/helper/internal/config"
	"github.com/decompute/helper/internal/detect"
	"github.com/decompute/helper/internal/docker"
	"github.com/decompute/helper/internal/readiness"
)

// Overridden at build time via -ldflags "-X main.defaultAPIBase=...".
var defaultAPIBase = "http://localhost:3000"

func main() {
	code := flag.String("code", "", "Pairing code shown in your Decompute browser tab")
	apiBase := flag.String("api-base", defaultAPIBase, "Decompute API base URL")
	agentToken := flag.String("agent-token", "", "Run as a resident job-execution agent using this node's agent token (from the listing page), instead of one-shot hardware detection")
	start := flag.String("start", "", "Redeem the one-time setup code shown on your listing page and start receiving jobs — saves your setup so future runs don't need a code")
	setup := flag.String("setup", "", "One-step setup: check this computer, register it with the code from the website, and start receiving jobs")
	resume := flag.Bool("resume", false, "Start receiving jobs using the setup saved by a previous --start")
	auto := flag.String("autostart", "", "on/off: automatically resume your saved setup whenever you log in (Windows and Linux)")
	prepareVideo := flag.Bool("prepare-video", false, "Download the pinned video workload images so this computer can take video work (several GB, one time)")
	flag.Parse()

	if *prepareVideo {
		os.Exit(agent.PrepareVideo())
	}
	if *auto != "" {
		os.Exit(runAutostart(*auto))
	}
	// Inside the helper container with no command at all, resume the saved
	// setup. (A --start after a reboot is handled in runStart: the code is
	// spent by then, and a spent code falls back to the saved setup.)
	if docker.InContainer() && *code == "" && *agentToken == "" && *start == "" && *setup == "" {
		if _, err := config.Load(); err == nil {
			os.Exit(runResume())
		}
	}
	if *setup != "" {
		os.Exit(runSetup(*setup, *apiBase))
	}
	if *start != "" {
		os.Exit(runStart(*start, *apiBase))
	}
	if *resume {
		os.Exit(runResume())
	}
	if *agentToken != "" {
		os.Exit(runAgent(*apiBase, *agentToken))
	}
	if *code != "" {
		exitCode := run(*code, *apiBase)
		pauseIfInteractive()
		os.Exit(exitCode)
	}

	// No flags at all — the double-click path. Prompt once for whatever
	// code the website is showing and let the backend's response say
	// whether it's an activation code or a hardware-detection pairing code,
	// so opening the app is always the same "paste the code" action no
	// matter which step of setup this is.
	exitCode := runInteractive(*apiBase)
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

// runSetup is the one-command path the website shows: check this computer,
// register it under the code's account, and start receiving jobs. In the
// helper container, Docker reruns the same command after every reboot, long
// after the code is spent; the saved setup takes over then.
func runSetup(setupFlag, apiBase string) int {
	code, embeddedBase := splitCodeAndHost(strings.TrimSpace(setupFlag))
	if embeddedBase != "" {
		apiBase = embeddedBase
	}

	spec := detect.Detect()
	fmt.Printf("This computer: %d CPU cores, %.1f GB RAM\n", spec.CPUCores, spec.RAMGB)
	ready := readiness.CheckLocal(spec, func(readiness.Check) {})

	// A computer that was set up before (the config volume survives
	// replacing the container) hands back its old identity, so it keeps its
	// existing entry on the website instead of appearing twice.
	previousAgentToken := ""
	if saved, err := config.Load(); err == nil && saved.NodeID != "" && saved.APIBase == apiBase {
		previousAgentToken = saved.NodeID + "." + saved.Secret
	}

	fmt.Printf("Connecting to %s...\n", apiBase)
	nodeID, secret, name, err := client.Setup(apiBase, code, previousAgentToken, spec, ready)
	if err != nil {
		if docker.InContainer() {
			if _, loadErr := config.Load(); loadErr == nil {
				fmt.Println("Using this computer's saved setup.")
				return runResume()
			}
		}
		switch err {
		case client.ErrInvalidCode:
			fmt.Println("This code is invalid or has expired. Copy the command from the website again.")
		case client.ErrNotReady:
			fmt.Println("This computer isn't ready yet:")
			for _, check := range ready.Checks {
				if !check.Ready && check.ID == "docker" {
					fmt.Printf("  %s — %s\n", check.Label, check.Install)
				}
			}
		default:
			fmt.Println(err.Error())
		}
		if docker.InContainer() {
			// Exiting would make Docker restart this failed setup forever.
			// Pasting the website's command again replaces this container.
			select {}
		}
		return 1
	}

	fmt.Printf("Set up as %q.\n", name)
	return finishStart(apiBase, nodeID, secret)
}

// runStart redeems a short, one-time code (shown on the listing page) for
// the node's real credential, saves it for next time, then starts
// receiving jobs — the whole reason a seller never has to see or type the
// long-lived secret itself.
func runStart(startFlag, apiBase string) int {
	code, embeddedBase := splitCodeAndHost(strings.TrimSpace(startFlag))
	if embeddedBase != "" {
		apiBase = embeddedBase
	}

	fmt.Printf("Connecting to %s...\n", apiBase)
	nodeID, secret, err := client.EnrollAgent(apiBase, code)
	if err != nil {
		// In the helper container, Docker reruns this same --start command
		// after every reboot, long after the one-time code was spent (or
		// before the network is up). A saved setup is what to run then.
		if docker.InContainer() {
			if _, loadErr := config.Load(); loadErr == nil {
				fmt.Println("Using this computer's saved setup.")
				return runResume()
			}
		}
		if err == client.ErrInvalidCode {
			fmt.Println("This code is invalid or has expired. Go back to your listing page and copy the command again.")
		} else {
			fmt.Println(err.Error())
		}
		return 1
	}

	return finishStart(apiBase, nodeID, secret)
}

// runInteractive is what a plain double-click runs: one prompt, whatever
// code is on screen, no flags to know about. A seller can't tell a
// hardware-detection pairing code from an agent activation code just by
// looking at it, so this tries activation first and falls back to
// detection on the same "invalid or expired" response a wrong-flow code
// would get anyway.
func runInteractive(apiBase string) int {
	fmt.Print("Paste the code from your Decompute browser tab: ")
	reader := bufio.NewReader(os.Stdin)
	line, _ := reader.ReadString('\n')
	input := strings.TrimSpace(line)
	if input == "" {
		fmt.Println("No code provided.")
		return 1
	}

	code, embeddedBase := splitCodeAndHost(input)
	if embeddedBase != "" {
		apiBase = embeddedBase
	}

	fmt.Printf("Connecting to %s...\n", apiBase)
	nodeID, secret, err := client.EnrollAgent(apiBase, code)
	if err == nil {
		return finishStart(apiBase, nodeID, secret)
	}
	if err != client.ErrInvalidCode {
		fmt.Println(err.Error())
		return 1
	}

	return runDetect(code, apiBase)
}

// finishStart is what both runStart and runInteractive do once a code has
// been redeemed for a real credential: save it, set it up to survive a
// restart, and start it running in the background right now.
func finishStart(apiBase, nodeID, secret string) int {
	if err := config.Save(config.AgentConfig{NodeID: nodeID, Secret: secret, APIBase: apiBase}); err != nil {
		fmt.Println("Connected, but couldn't save your setup for next time:", err)
		return runAgent(apiBase, nodeID+"."+secret)
	}

	// The container is the background process, and Docker restarts it after
	// a reboot; there's no autostart to install and nothing to detach from.
	if docker.InContainer() {
		fmt.Println("Connected. This computer is now receiving jobs, and Docker will restart it automatically.")
		return runAgent(apiBase, nodeID+"."+secret)
	}

	if runtime.GOOS == "darwin" {
		// Job execution isn't supported on macOS yet (see runAgent below),
		// so there's nothing to keep running in the background there.
		return runAgent(apiBase, nodeID+"."+secret)
	}

	exePath, err := os.Executable()
	if err != nil {
		fmt.Println("Connected, but couldn't set this up to run in the background:", err)
		fmt.Println("Leave this window open to keep receiving jobs.")
		return runAgent(apiBase, nodeID+"."+secret)
	}
	if err := autostart.Install(exePath); err != nil {
		fmt.Println("Connected, but couldn't set this up to start automatically:", err)
		fmt.Println("Leave this window open to keep receiving jobs, or run --autostart on to try again.")
		return runAgent(apiBase, nodeID+"."+secret)
	}
	if err := autostart.StartNow(exePath); err != nil {
		fmt.Println("Set up to start automatically next time, but couldn't start it in the background right now:", err)
		fmt.Println("Leave this window open to keep receiving jobs until your next restart.")
		return runAgent(apiBase, nodeID+"."+secret)
	}

	fmt.Println("Connected. Your computer is now receiving jobs in the background, and will keep doing that automatically — including after restarts. You can close this window.")
	return 0
}

// runResume reuses the setup a previous --start saved — no code, no token,
// nothing to copy or paste.
func runResume() int {
	cfg, err := config.Load()
	if err != nil {
		fmt.Println(err.Error())
		return 1
	}
	return runAgent(cfg.APIBase, cfg.NodeID+"."+cfg.Secret)
}

// runAutostart installs or removes a per-user launcher that runs --resume
// at login — no admin rights, no OS service, fully reversible.
func runAutostart(mode string) int {
	exePath, err := os.Executable()
	if err != nil {
		fmt.Println("Couldn't find this program's own path:", err)
		return 1
	}
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case "on":
		if _, err := config.Load(); err != nil {
			fmt.Println("Run --start with your setup code at least once before turning on autostart.")
			return 1
		}
		if err := autostart.Install(exePath); err != nil {
			fmt.Println(err.Error())
			return 1
		}
		if err := autostart.StartNow(exePath); err != nil {
			fmt.Println("Set up to start automatically next time, but couldn't start it in the background right now:", err)
			return 1
		}
		fmt.Println("Done — your computer is now receiving jobs in the background, and will keep doing that automatically at every login.")
	case "off":
		if err := autostart.Remove(); err != nil {
			fmt.Println(err.Error())
			return 1
		}
		fmt.Println("Removed. Run --resume (or --start with a fresh code) any time you want to reconnect.")
	default:
		fmt.Println("Use --autostart on or --autostart off.")
		return 1
	}
	return 0
}

func run(codeFlag, apiBase string) int {
	pairingCode := strings.TrimSpace(codeFlag)
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
	return runDetect(pairingCode, apiBase)
}

func runDetect(pairingCode, apiBase string) int {
	fmt.Printf("Reporting to %s\n", apiBase)
	fmt.Println("Detecting your hardware...")
	spec := detect.Detect()

	fmt.Printf("  GPU: %d x %s (%.1f GB VRAM)\n", spec.GPUCount, spec.GPUModel, spec.VRAMGB)
	fmt.Printf("  RAM: %.1f GB\n", spec.RAMGB)
	fmt.Printf("  CPU: %s (%d cores)\n", spec.CPUModel, spec.CPUCores)

	fmt.Println("Checking Docker...")
	ready := readiness.CheckLocal(spec, func(check readiness.Check) {
		// Docking runs on the CPU: only Docker is required, so a missing GPU
		// shouldn't read as a problem.
		state := "missing"
		if check.Ready {
			state = "ready"
		} else if check.ID != "docker" {
			fmt.Printf("  [optional] %s — not needed for docking\n", check.Label)
			return
		}
		fmt.Printf("  [%s] %s — %s\n", state, check.Label, check.Detail)
	})

	if err := client.ReportSpec(apiBase, pairingCode, spec, ready); err != nil {
		if err == client.ErrInvalidCode {
			fmt.Println("This code is invalid or has expired. Go back to the browser, generate a new one, and try again.")
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
	if docker.InContainer() {
		return // run as a terminal command, not a window that would close
	}
	fi, err := os.Stdin.Stat()
	if err != nil || fi.Mode()&os.ModeCharDevice == 0 {
		return
	}
	fmt.Print("\nPress Enter to close this window...")
	bufio.NewReader(os.Stdin).ReadString('\n')
}
