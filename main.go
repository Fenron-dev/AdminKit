package main

import (
	"embed"
	"log"
	"os"
	"time"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app := NewApp()

	// WebView2-Daten (Cache, localStorage) nicht im Profil des Kunden ablegen,
	// sondern in einem temporären Ordner, der beim Beenden gelöscht wird
	// (Minimal-Fußabdruck). Unter macOS verwaltet WKWebView den Speicher selbst.
	webviewDir, _ := os.MkdirTemp("", "adminkit-webview-")
	defer func() {
		if webviewDir == "" {
			return
		}
		// WebView2-Prozesse geben Dateien teils verzögert frei
		for i := 0; i < 10; i++ {
			if os.RemoveAll(webviewDir) == nil {
				return
			}
			time.Sleep(300 * time.Millisecond)
		}
	}()

	err := wails.Run(&options.App{
		Title:             "AdminKit",
		Width:             1280,
		Height:            800,
		MinWidth:          1024,
		MinHeight:         720,
		DisableResize:     false,
		Fullscreen:        false,
		Frameless:         false,
		StartHidden:       false,
		HideWindowOnClose: false,
		BackgroundColour:  &options.RGBA{R: 15, G: 23, B: 42, A: 1}, // Dunkel: #0F172A

		AssetServer: &assetserver.Options{
			Assets: assets,
		},

		OnStartup:  app.Startup,
		OnShutdown: app.Shutdown,

		Bind: []interface{}{
			app,
		},

		// Windows-spezifische Optionen
		Windows: &windows.Options{
			WebviewUserDataPath:  webviewDir,
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
			DisableWindowIcon:    false,
			Theme:                windows.SystemDefault,
		},

		// macOS-spezifische Optionen
		Mac: &mac.Options{
			TitleBar:             mac.TitleBarHiddenInset(),
			WebviewIsTransparent: true,
			WindowIsTranslucent:  false,
		},
	})

	if err != nil {
		log.Print("AdminKit konnte nicht gestartet werden: ", err)
	}
}
