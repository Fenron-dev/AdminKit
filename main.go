package main

import (
	"embed"
	"log"

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

	err := wails.Run(&options.App{
		Title:            "AdminKit",
		Width:            1280,
		Height:           800,
		MinWidth:         1024,
		MinHeight:        720,
		DisableResize:    false,
		Fullscreen:       false,
		Frameless:        false,
		StartHidden:      false,
		HideWindowOnClose: false,
		BackgroundColour: &options.RGBA{R: 15, G: 23, B: 42, A: 1}, // Dunkel: #0F172A

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
		log.Fatal("AdminKit konnte nicht gestartet werden:", err)
	}
}
