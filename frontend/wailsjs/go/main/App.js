// @ts-check
// Automatisch generierte Wails-Bindings. NICHT MANUELL BEARBEITEN.
// Bei Änderungen an app.go: `wails generate module` ausführen.

export function GetAppVersion() {
    return window['go']['main']['App']['GetAppVersion']();
}

export function GetConfig() {
    return window['go']['main']['App']['GetConfig']();
}

export function GetVaultPath() {
    return window['go']['main']['App']['GetVaultPath']();
}

export function NewSession(arg1) {
    return window['go']['main']['App']['NewSession'](arg1);
}
