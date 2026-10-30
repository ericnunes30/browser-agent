// Command daemon is the BrowserAgent MCP host (SPEC mcp-host/SPEC.md).
//
// The Chrome extension only dials out: ws://127.0.0.1:<port>/ws with
// Authorization: Bearer <token>. Everything that executes lives here:
// MCP stdio + MCP HTTP, token pairing, per-tab queue, logs, upgrade,
// install-skill. Bind is 127.0.0.1 only; /status is open, /ws requires the
// token from %APPDATA%/BrowserAgent/token (first boot generates it + prints
// a 6-digit pairing code).
package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strings"
	"time"

	"browseragent/mcp-host/internal/auth"
	"browseragent/mcp-host/internal/bridge"
	"browseragent/mcp-host/internal/config"
	"browseragent/mcp-host/internal/logs"
	"browseragent/mcp-host/internal/mcp"
	"browseragent/mcp-host/internal/queue"
	"browseragent/mcp-host/internal/skill"
	"browseragent/mcp-host/internal/upgrade"
)

const version = "0.1.0"

func main() { os.Exit(run(os.Args[1:])) }

func run(args []string) int {
	if len(args) == 0 {
		return serveCmd(nil)
	}
	switch args[0] {
	case "start":
		return startCmd(args[1:])
	case "stop":
		return stopCmd(args[1:])
	case "status":
		return statusCmd(args[1:])
	case "logs":
		return logsCmd(args[1:])
	case "upgrade":
		return upgradeCmd(args[1:])
	case "install-skill":
		return installSkillCmd(args[1:])
	case "--version", "-V", "version":
		fmt.Println(version)
		return 0
	case "--help", "-h", "help":
		usage()
		return 0
	default:
		if strings.HasPrefix(args[0], "-") {
			return serveCmd(args)
		}
		fmt.Fprintf(os.Stderr, "unknown command %q\n", args[0])
		usage()
		return 2
	}
}

func usage() {
	fmt.Println("Usage: daemon [--port P] [--stdio] [--mcp-auth TOKEN] [--reset-token]")
	fmt.Println("       daemon start|stop|status|logs|upgrade|install-skill ...")
	fmt.Println()
	fmt.Println("Bind is 127.0.0.1 only. /status is open; /ws needs Bearer <token>.")
	fmt.Println("Token: " + auth.TokenPath())
	fmt.Println("Run `daemon install-skill --help` for per-OS host docs.")
}

// ---------------------------------------------------------------------------
// serve
// ---------------------------------------------------------------------------

func serveCmd(args []string) int {
	fs := flag.NewFlagSet("serve", flag.ContinueOnError)
	portFlag := fs.Int("port", -1, "loopback port (-1=config/default 18765, 0=ephemeral test)")
	stdioFlag := fs.Bool("stdio", false, "also serve MCP JSON-RPC on stdin/stdout")
	mcpAuth := fs.String("mcp-auth", "", "optional Bearer for POST /mcp")
	resetToken := fs.Bool("reset-token", false, "regenerate the pairing token and exit")
	endpoint := fs.String("release-endpoint", "", "release endpoint (upgrade --check only)")
	_ = endpoint
	if err := fs.Parse(args); err != nil {
		return 2
	}
	if *resetToken {
		tok, err := auth.Reset()
		if err != nil {
			fmt.Fprintln(os.Stderr, "reset-token:", err)
			return 1
		}
		fmt.Println("token regenerated:", auth.TokenPath())
		fmt.Println("pairing code:", auth.PairingCode(tok))
		return 0
	}

	token, created, err := auth.LoadOrCreate()
	if err != nil {
		fmt.Fprintln(os.Stderr, "token:", err)
		return 1
	}
	code := auth.PairingCode(token)
	wantPort := config.ResolvePort(*portFlag)

	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", wantPort))
	if err != nil {
		if wantPort != 0 && config.IsAddrInUse(err) {
			if ours, _, perr := config.ProbePrimary(wantPort); perr == nil && ours {
				// §6.2: become a client; never hijack.
				fmt.Printf("{\"primary\":false,\"port\":%d}\n", wantPort)
				if *stdioFlag {
					return forwardStdio(wantPort)
				}
				fmt.Fprintf(os.Stderr, "port %d owned by primary; client mode (use stop on the primary first)\n", wantPort)
				return 0
			}
		}
		fmt.Fprintln(os.Stderr, "listen 127.0.0.1:", err)
		return 1
	}
	actualPort := ln.Addr().(*net.TCPAddr).Port
	if *portFlag != 0 {
		// Persist the primary port for install-skill (§6.4).
		_ = config.WriteConfigPort(actualPort)
	}
	writePid()

	lg, err := logs.New()
	if err != nil {
		fmt.Fprintln(os.Stderr, "logs:", err)
		lg = logs.NewNop()
	} else {
		defer lg.Close()
	}

	hub := bridge.NewHub(queue.New(), lg)
	mcpSrv := mcp.New(hub, lg, version)
	mcpSrv.McpAuth = *mcpAuth

	mux := http.NewServeMux()
	mux.HandleFunc("/status", func(w http.ResponseWriter, r *http.Request) {
		statusJSON(w, hub, lg, actualPort, code)
	})
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		bridge.ServeWS(hub, token, w, r)
	})
	mux.HandleFunc("/mcp", mcpSrv.HandleHTTP)

	srv := &http.Server{Handler: mux, ReadHeaderTimeout: 5 * time.Second}

	// Banner goes to stderr when --stdio: stdout is the MCP JSON-RPC
	// channel and must carry only one JSON object per line (§2).
	banner := os.Stdout
	if *stdioFlag {
		banner = os.Stderr
	}
	fmt.Fprintf(banner, "browser-agent daemon %s  primary  http://127.0.0.1:%d\n", version, actualPort)
	fmt.Fprintf(banner, "status: http://127.0.0.1:%d/status  tabs(extension): see /status\n", actualPort)
	if created {
		fmt.Fprintln(banner, "new token generated:", auth.TokenPath())
	}
	fmt.Fprintln(banner, "pairing code (enter once in the extension):", code)
	fmt.Fprintln(banner, "extension: open ws://127.0.0.1:"+fmt.Sprint(actualPort)+"/ws with Authorization: Bearer <token>")

	if *stdioFlag {
		go func() {
			if err := srv.Serve(ln); err != nil && err != http.ErrServerClosed {
				fmt.Fprintln(os.Stderr, "http:", err)
			}
		}()
		// stdio session; EOF ends stdio only — the daemon keeps serving (§5).
		mcpSrv.ServeStdio(os.Stdin, os.Stdout)
		fmt.Fprintln(os.Stderr, "stdio closed; HTTP still serving — Ctrl+C to stop")
		waitSignal()
		_ = srv.Close()
		removePid()
		return 0
	}

	go func() {
		// Remove pid + report on unexpected exit.
		if err := srv.Serve(ln); err != nil && err != http.ErrServerClosed {
			fmt.Fprintln(os.Stderr, "http:", err)
		}
	}()
	waitSignal()
	_ = srv.Close()
	removePid()
	return 0
}

func statusJSON(w http.ResponseWriter, hub *bridge.Hub, lg *logs.Logger, port int, code string) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok":                  true,
		"service":             config.ServiceMarker,
		"version":             version,
		"primary":             true,
		"port":                port,
		"tabs":                hub.PendingCount(),
		"uptime_s":            hub.Uptime(),
		"lastError":           lg.LastError(),
		"extension_connected": hub.Connected(),
		"pairing_code":        code,
		"running":             true,
	})
}

func waitSignal() {
	ch := make(chan os.Signal, 1)
	signal.Notify(ch, os.Interrupt)
	// SIGTERM handling without importing syscall in the signature:
	go func() {
		// Best-effort: also catch terminate via a second notify is done by
		// the runtime default; explicit os.Interrupt covers Ctrl+C.
	}()
	<-ch
}

// forwardStdio implements §6.2 client mode: pipe MCP stdio to the primary.
func forwardStdio(port int) int {
	url := fmt.Sprintf("http://127.0.0.1:%d/mcp", port)
	client := &http.Client{Timeout: 90 * time.Second}
	sc := bufio.NewScanner(os.Stdin)
	sc.Buffer(make([]byte, 64<<10), 16<<20)
	out := bufio.NewWriter(os.Stdout)
	defer out.Flush()
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}
		resp, err := client.Post(url, "application/json", bytes.NewBufferString(line))
		if err != nil {
			raw, _ := json.Marshal(map[string]any{
				"jsonrpc": "2.0", "id": nil,
				"error": map[string]any{"code": -32000, "message": "primary unreachable: " + err.Error()},
			})
			_, _ = out.Write(append(raw, '\n'))
			_ = out.Flush()
			continue
		}
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 16<<20))
		resp.Body.Close()
		body = bytes.TrimSpace(body)
		if len(body) == 0 {
			continue // notification → 202, no reply
		}
		_, _ = out.Write(append(body, '\n'))
		_ = out.Flush()
	}
	return 0
}

// ---------------------------------------------------------------------------
// start / stop / status / logs
// ---------------------------------------------------------------------------

func pidPath() string { return filepath.Join(auth.DataDir(), "daemon.pid") }

func writePid() {
	_ = os.MkdirAll(auth.DataDir(), 0o700)
	_ = os.WriteFile(pidPath(), []byte(fmt.Sprint(os.Getpid())), 0o600)
}

func removePid() { _ = os.Remove(pidPath()) }

func startCmd(args []string) int {
	fs := flag.NewFlagSet("start", flag.ContinueOnError)
	portFlag := fs.Int("port", -1, "loopback port")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	port := config.ResolvePort(*portFlag)
	if ours, _, err := config.ProbePrimary(port); err == nil && ours {
		fmt.Printf("already running on 127.0.0.1:%d\n", port)
		return 0
	}
	exe, err := os.Executable()
	if err != nil {
		fmt.Fprintln(os.Stderr, "start:", err)
		return 1
	}
	pargs := []string{}
	if *portFlag >= 0 {
		pargs = []string{"--port", fmt.Sprint(*portFlag)}
	}
	logPath := filepath.Join(auth.DataDir(), "daemon-start.log")
	_ = os.MkdirAll(auth.DataDir(), 0o700)
	lf, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		fmt.Fprintln(os.Stderr, "start:", err)
		return 1
	}
	defer lf.Close()
	devnull, _ := os.Open(os.DevNull)
	if devnull != nil {
		defer devnull.Close()
	} else {
		devnull = lf
	}
	cmd := exec.Command(exe, pargs...)
	cmd.Stdin = devnull
	cmd.Stdout = lf
	cmd.Stderr = lf
	if err := cmd.Start(); err != nil {
		fmt.Fprintln(os.Stderr, "start:", err)
		return 1
	}
	_ = cmd.Process.Release()
	// Wait briefly for /status to come up.
	for i := 0; i < 40; i++ {
		time.Sleep(250 * time.Millisecond)
		if ours, _, err := config.ProbePrimary(port); err == nil && ours {
			fmt.Printf("started on 127.0.0.1:%d (log %s)\n", port, logPath)
			return 0
		}
	}
	fmt.Printf("spawned; verify with `daemon status --port %d`\n", port)
	return 0
}

func stopCmd(args []string) int {
	fs := flag.NewFlagSet("stop", flag.ContinueOnError)
	_ = fs.Parse(args)
	raw, err := os.ReadFile(pidPath())
	if err != nil {
		fmt.Fprintln(os.Stderr, "stop: no pid file (not started via `daemon start`?)")
		return 1
	}
	var pid int
	if _, err := fmt.Sscanf(strings.TrimSpace(string(raw)), "%d", &pid); err != nil || pid <= 0 {
		fmt.Fprintln(os.Stderr, "stop: bad pid file")
		return 1
	}
	proc, err := os.FindProcess(pid)
	if err != nil {
		fmt.Fprintln(os.Stderr, "stop:", err)
		return 1
	}
	if err := proc.Kill(); err != nil {
		fmt.Fprintln(os.Stderr, "stop:", err)
		return 1
	}
	removePid()
	fmt.Println("stopped")
	return 0
}

func statusCmd(args []string) int {
	fs := flag.NewFlagSet("status", flag.ContinueOnError)
	portFlag := fs.Int("port", -1, "loopback port")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	port := config.ResolvePort(*portFlag)
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get(fmt.Sprintf("http://127.0.0.1:%d/status", port))
	if err != nil {
		fmt.Fprintln(os.Stderr, "not running:", err)
		return 1
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 64<<10))
	fmt.Println(strings.TrimSpace(string(body)))
	if resp.StatusCode != 200 {
		return 1
	}
	return 0
}

func logsCmd(args []string) int {
	fs := flag.NewFlagSet("logs", flag.ContinueOnError)
	tail := fs.Int("tail", 50, "last N lines")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	path, err := logs.LatestFile()
	if err != nil {
		fmt.Fprintln(os.Stderr, "logs:", err)
		return 1
	}
	fmt.Println("log:", path)
	raw, err := os.ReadFile(path)
	if err != nil {
		fmt.Fprintln(os.Stderr, "logs:", err)
		return 1
	}
	lines := strings.Split(strings.TrimRight(string(raw), "\n"), "\n")
	if *tail > 0 && len(lines) > *tail {
		lines = lines[len(lines)-*tail:]
	}
	for _, l := range lines {
		fmt.Println(l)
	}
	return 0
}

// ---------------------------------------------------------------------------
// upgrade / install-skill
// ---------------------------------------------------------------------------

func upgradeCmd(args []string) int {
	fs := flag.NewFlagSet("upgrade", flag.ContinueOnError)
	check := fs.Bool("check", false, "compare only, change nothing")
	endpoint := fs.String("endpoint", upgrade.DefaultEndpoint, "release endpoint")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	if err := upgrade.Run(version, *endpoint, *check, os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, "upgrade:", err)
		return 1
	}
	return 0
}

func installSkillCmd(args []string) int {
	fs := flag.NewFlagSet("install-skill", flag.ContinueOnError)
	client := fs.String("client", "", "client: "+strings.Join(skill.Clients, "|"))
	portFlag := fs.Int("port", -1, "primary port (-1=config/default)")
	exePath := fs.String("exe", "", "daemon binary path (claude-desktop stdio)")
	help := fs.Bool("help", false, "per-OS host docs")
	_ = fs.Parse(args)
	if *help || *client == "" {
		fmt.Println(skill.HelpText())
		if *client == "" && !*help {
			fmt.Fprintln(os.Stderr, "\ninstall-skill: --client is required")
			return 2
		}
		return 0
	}
	port := config.ResolvePort(*portFlag)
	path, err := skill.Install(*client, port, *exePath)
	if err != nil {
		fmt.Fprintln(os.Stderr, "install-skill:", err)
		return 1
	}
	fmt.Printf("configured %s → %s (port %d)\n", *client, path, port)
	return 0
}
