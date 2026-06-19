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

// ── Phase 2: System-Scan ──
export function ScanSystem() {
    return window['go']['main']['App']['ScanSystem']();
}

export function SaveSystemScan(arg1, arg2) {
    return window['go']['main']['App']['SaveSystemScan'](arg1, arg2);
}

// ── Phase 3: Netzwerk-Scan ──
export function ScanNetwork() {
    return window['go']['main']['App']['ScanNetwork']();
}

export function SaveNetworkScan(arg1, arg2) {
    return window['go']['main']['App']['SaveNetworkScan'](arg1, arg2);
}
