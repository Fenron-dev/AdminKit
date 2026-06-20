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

// ── Phase 9: Erweiterte Scanner ──
export function ScanAutostart() {
    return window['go']['main']['App']['ScanAutostart']();
}

export function ScanServices() {
    return window['go']['main']['App']['ScanServices']();
}

export function ScanEvents() {
    return window['go']['main']['App']['ScanEvents']();
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

export function ExportCSV() {
    return window['go']['main']['App']['ExportCSV']();
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

// ── Datei-Operationen ──
export function OpenFile(arg1) {
    return window['go']['main']['App']['OpenFile'](arg1);
}

export function RevealFile(arg1) {
    return window['go']['main']['App']['RevealFile'](arg1);
}

// ── Neuere Scanner (nach initialem Setup hinzugefügt) ──
export function ScanBrowserExtensions() {
    return window['go']['main']['App']['ScanBrowserExtensions']();
}

export function ScanNetworkBasic() {
    return window['go']['main']['App']['ScanNetworkBasic']();
}

export function GetSessions() {
    return window['go']['main']['App']['GetSessions']();
}

export function StartService(arg1) {
    return window['go']['main']['App']['StartService'](arg1);
}

export function StopService(arg1) {
    return window['go']['main']['App']['StopService'](arg1);
}

// ── VirusTotal ──
export function CheckVirusTotalItems(arg1) {
    return window['go']['main']['App']['CheckVirusTotalItems'](arg1);
}

export function HashFileForVT(arg1) {
    return window['go']['main']['App']['HashFileForVT'](arg1);
}

export function OpenVTInBrowser(arg1) {
    return window['go']['main']['App']['OpenVTInBrowser'](arg1);
}

export function PickFileForVTScan() {
    return window['go']['main']['App']['PickFileForVTScan']();
}

// ── KI-Analyse ──
export function GetAvailableAIProviders() {
    return window['go']['main']['App']['GetAvailableAIProviders']();
}

export function CallAI(arg1, arg2, arg3) {
    return window['go']['main']['App']['CallAI'](arg1, arg2, arg3);
}

export function CallLocalAI(arg1, arg2, arg3) {
    return window['go']['main']['App']['CallLocalAI'](arg1, arg2, arg3);
}

export function GetOpenRouterModels(arg1) {
    return window['go']['main']['App']['GetOpenRouterModels'](arg1);
}

// ── Terminal / Raw-Befehl ──
export function RunRawCommand(arg1) {
    return window['go']['main']['App']['RunRawCommand'](arg1);
}

// ── Plattform-Erkennung ──
export function GetPlatform() {
    return window['go']['main']['App']['GetPlatform']();
}

export function GetProcesses() {
    return window['go']['main']['App']['GetProcesses']();
}

export function GetVTWhitelist() {
    return window['go']['main']['App']['GetVTWhitelist']();
}

export function AddToVTWhitelist(arg1, arg2) {
    return window['go']['main']['App']['AddToVTWhitelist'](arg1, arg2);
}

export function RemoveFromVTWhitelist(arg1) {
    return window['go']['main']['App']['RemoveFromVTWhitelist'](arg1);
}

export function SaveVTAuditLog(arg1) {
    return window['go']['main']['App']['SaveVTAuditLog'](arg1);
}

export function UploadFileToVirusTotal(arg1) {
    return window['go']['main']['App']['UploadFileToVirusTotal'](arg1);
}

export function GetNetworkConnections() {
    return window['go']['main']['App']['GetNetworkConnections']();
}

// ── Benutzerkonten & Geplante Aufgaben ──
export function ScanUsers() {
    return window['go']['main']['App']['ScanUsers']();
}

export function ScanScheduledTasks() {
    return window['go']['main']['App']['ScanScheduledTasks']();
}

// ── Konfigurationsprofile ──
export function ScanConfigProfiles() {
    return window['go']['main']['App']['ScanConfigProfiles']();
}

// ── USB-Geräte ──
export function ScanUSBDevices() {
    return window['go']['main']['App']['ScanUSBDevices']();
}

// ── Vault-Archivierung ──
export function PickArchiveDirectory() {
    return window['go']['main']['App']['PickArchiveDirectory']();
}

export function ArchiveVault(arg1) {
    return window['go']['main']['App']['ArchiveVault'](arg1);
}

// ── Terminal Log ──
export function SaveTerminalLog(arg1) {
    return window['go']['main']['App']['SaveTerminalLog'](arg1);
}
