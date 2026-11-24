// Package capture: Bildschirmfotos und -videos für Anleitungen (#121).
// Screenshots über Betriebssystem-Werkzeuge (macOS screencapture, Windows
// PowerShell/GDI), Videos unter macOS über screencapture -v; unter Windows
// nimmt das Frontend per getDisplayMedia auf. FFmpeg (optional) für GIF.
package capture

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"adminkit/internal/execx"
)

// ErrCanceled: Nutzer hat die Auswahl abgebrochen (keine Datei).
var ErrCanceled = errors.New("Aufnahme abgebrochen")

// Screenshot nimmt den Bildschirm auf und liefert ein PNG als data:-URI.
// mode: "screen" (alle Bildschirme) oder "interactive" (Bereich/Fenster wählen, nur macOS).
func Screenshot(ctx context.Context, mode string, delay int) (string, error) {
	if delay < 0 || delay > 30 {
		delay = 0
	}
	tmp := filepath.Join(os.TempDir(), fmt.Sprintf("adminkit-shot-%d.png", time.Now().UnixNano()))
	defer os.Remove(tmp)
	if delay > 0 {
		select {
		case <-time.After(time.Duration(delay) * time.Second):
		case <-ctx.Done():
			return "", ctx.Err()
		}
	}
	switch runtime.GOOS {
	case "darwin":
		args := []string{"-x"}
		if mode == "interactive" {
			args = append(args, "-i")
		}
		if _, err := execx.Run(ctx, execx.Options{Timeout: 5 * time.Minute}, "screencapture", append(args, tmp)...); err != nil {
			return "", err
		}
	case "windows":
		// DPI-bewusst, sonst wird bei Skalierung nur ein Teil des Bildschirms aufgenommen
		ps := `Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class AKDpi { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); }'; [AKDpi]::SetProcessDPIAware() | Out-Null; ` +
			`Add-Type -AssemblyName System.Windows.Forms,System.Drawing; ` +
			`$b=[System.Windows.Forms.SystemInformation]::VirtualScreen; ` +
			`$bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height; $g=[System.Drawing.Graphics]::FromImage($bmp); ` +
			`$g.CopyFromScreen($b.Left,$b.Top,0,0,$bmp.Size); $bmp.Save('` + strings.ReplaceAll(tmp, "'", "''") + `',[System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose()`
		if _, err := execx.Run(ctx, execx.Options{Timeout: 30 * time.Second}, "powershell.exe", "-NoProfile", "-NonInteractive", "-Command", ps); err != nil {
			return "", err
		}
	default:
		return "", errors.New("Bildschirmfoto wird auf diesem System nicht unterstützt")
	}
	b, err := os.ReadFile(tmp)
	if os.IsNotExist(err) || (err == nil && len(b) == 0) {
		return "", ErrCanceled
	}
	if err != nil {
		return "", err
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(b), nil
}

// ── Video über screencapture (macOS) ────────────────────────────────────────

// Recorder steuert eine laufende Aufnahme.
type Recorder struct {
	mu   sync.Mutex
	cmd  *exec.Cmd
	file string
	done chan error
}

// NativeVideo meldet, ob das System selbst aufnehmen kann (macOS).
func NativeVideo() bool { return runtime.GOOS == "darwin" }

// Start beginnt die Aufnahme des Hauptbildschirms (mic = Standard-Mikrofon, clicks = Klicks zeigen).
func (r *Recorder) Start(mic, clicks bool) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.cmd != nil {
		return errors.New("Es läuft bereits eine Aufnahme")
	}
	if !NativeVideo() {
		return errors.New("Videoaufnahme über das System nur unter macOS")
	}
	r.file = filepath.Join(os.TempDir(), fmt.Sprintf("adminkit-rec-%d.mov", time.Now().UnixNano()))
	args := []string{"-v", "-x"}
	if mic {
		args = append(args, "-g")
	}
	if clicks {
		args = append(args, "-k")
	}
	c := exec.Command("screencapture", append(args, r.file)...)
	if err := c.Start(); err != nil {
		return err
	}
	r.cmd, r.done = c, make(chan error, 1)
	go func() { r.done <- c.Wait() }()
	return nil
}

// Stop beendet die Aufnahme und liefert den Pfad der Videodatei.
func (r *Recorder) Stop() (string, error) {
	r.mu.Lock()
	c, done, file := r.cmd, r.done, r.file
	r.cmd = nil
	r.mu.Unlock()
	if c == nil {
		return "", errors.New("Es läuft keine Aufnahme")
	}
	_ = c.Process.Signal(os.Interrupt) // screencapture schreibt die Datei sauber zu Ende
	select {
	case <-done:
	case <-time.After(15 * time.Second):
		_ = c.Process.Kill()
	}
	if st, err := os.Stat(file); err != nil || st.Size() == 0 {
		return "", errors.New("Keine Aufnahme entstanden – ist „Bildschirmaufnahme“ für AdminKit in den Systemeinstellungen erlaubt?")
	}
	return file, nil
}

// ── FFmpeg (optional) ───────────────────────────────────────────────────────

// FindFFmpeg sucht ffmpeg im Vault-Ordner tools/ffmpeg oder im PATH.
func FindFFmpeg(vaultRoot string) string {
	name := "ffmpeg"
	if runtime.GOOS == "windows" {
		name = "ffmpeg.exe"
	}
	if vaultRoot != "" {
		p := filepath.Join(vaultRoot, "tools", "ffmpeg", name)
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			return p
		}
	}
	if p, err := exec.LookPath(name); err == nil {
		return p
	}
	return ""
}

// ToGIF wandelt ein Video in ein GIF (Ausschnitt start–end in Sekunden, Breite max. 960 px).
func ToGIF(ctx context.Context, ffmpeg, src, dst string, start, end float64, fps int) error {
	if fps <= 0 || fps > 30 {
		fps = 10
	}
	args := []string{"-y", "-loglevel", "error"}
	if start > 0 {
		args = append(args, "-ss", strconv.FormatFloat(start, 'f', 2, 64))
	}
	if end > start && end > 0 {
		args = append(args, "-t", strconv.FormatFloat(end-start, 'f', 2, 64))
	}
	vf := fmt.Sprintf("fps=%d,scale='min(960,iw)':-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4", fps)
	args = append(args, "-i", src, "-vf", vf, dst)
	res, err := execx.Run(ctx, execx.Options{Timeout: 10 * time.Minute}, ffmpeg, args...)
	if err != nil {
		return err
	}
	if res.ExitCode != 0 {
		return fmt.Errorf("ffmpeg: %s", res.Stderr)
	}
	return nil
}
