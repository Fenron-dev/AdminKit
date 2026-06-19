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

// ── Phase 4: Software-Inventarisierung ──
export function ScanSoftware() {
    return window['go']['main']['App']['ScanSoftware']();
}

export function SaveSoftwareScan(arg1, arg2) {
    return window['go']['main']['App']['SaveSoftwareScan'](arg1, arg2);
}

// ── Phase 5: Tools & Konsolen-Tools ──
export function RunConsoleTool(arg1, arg2) {
    return window['go']['main']['App']['RunConsoleTool'](arg1, arg2);
}

export function BackupVault() {
    return window['go']['main']['App']['BackupVault']();
}

export function GetClipboard() {
    return window['go']['main']['App']['GetClipboard']();
}

export function GetUptime() {
    return window['go']['main']['App']['GetUptime']();
}

// ── Phase 8: Drucker-Scanner ──
export function ScanPrinters() {
    return window['go']['main']['App']['ScanPrinters']();
}

export function SavePrinterScan(arg1, arg2) {
    return window['go']['main']['App']['SavePrinterScan'](arg1, arg2);
}

// ── Phase 6: Export & Einstellungen ──
export function ExportSession(arg1) {
    return window['go']['main']['App']['ExportSession'](arg1);
}

export function SaveConfig(arg1) {
    return window['go']['main']['App']['SaveConfig'](arg1);
}

export function PickLogoFile() {
    return window['go']['main']['App']['PickLogoFile']();
}

export function GetLogoBase64() {
    return window['go']['main']['App']['GetLogoBase64']();
}
