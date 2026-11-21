// @ts-check
// Automatisch generierte Wails-Bindings. NICHT MANUELL BEARBEITEN.
// Bei Änderungen an app.go: `wails generate module` ausführen.

export function GetAppVersion() {
    return window['go']['main']['App']['GetAppVersion']();
}

export function GetHostname() {
    return window['go']['main']['App']['GetHostname']();
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

// ── Session-Schnappschüsse ──
export function SaveScanSnapshot(arg1, arg2, arg3) {
    return window['go']['main']['App']['SaveScanSnapshot'](arg1, arg2, arg3);
}
export function LoadSession(arg1) {
    return window['go']['main']['App']['LoadSession'](arg1);
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

// ── USB Auswerfen ──
export function EjectUSBDevice(arg1) {
    return window['go']['main']['App']['EjectUSBDevice'](arg1);
}

// ── Autostart Toggle ──
export function ToggleAutostartEntry(arg1, arg2) {
    return window['go']['main']['App']['ToggleAutostartEntry'](arg1, arg2);
}

// ── Cleanup-Größen ──
export function GetCleanupSizes() {
    return window['go']['main']['App']['GetCleanupSizes']();
}

// ── Health Score ──
export function GetHealthScore() {
    return window['go']['main']['App']['GetHealthScore']();
}

// ── Ereignis-Detail ──
export function OpenEventInConsole(arg1) {
    return window['go']['main']['App']['OpenEventInConsole'](arg1);
}

// ── Optimierungsvorschläge & Quick-Actions ──
export function GetSuggestions() {
    return window['go']['main']['App']['GetSuggestions']();
}
export function RunFix(arg1) {
    return window['go']['main']['App']['RunFix'](arg1);
}
export function RunQuickAction(arg1) {
    return window['go']['main']['App']['RunQuickAction'](arg1);
}

export function ScanEventsRange(arg1, arg2, arg3) {
    return window['go']['main']['App']['ScanEventsRange'](arg1, arg2, arg3);
}

export function GetDiagnosticReport(arg1, arg2, arg3) {
    return window['go']['main']['App']['GetDiagnosticReport'](arg1, arg2, arg3);
}

// ── Periodic Maintenance ──
export function GetPeriodicStatus() {
    return window['go']['main']['App']['GetPeriodicStatus']();
}
export function RunPeriodicMaintenance(arg1) {
    return window['go']['main']['App']['RunPeriodicMaintenance'](arg1);
}

// ── Homebrew ──

// ── SSH-Verwaltung ──
export function GetSSHStatus() {
    return window['go']['main']['App']['GetSSHStatus']();
}
export function SetSSHEnabled(arg1) {
    return window['go']['main']['App']['SetSSHEnabled'](arg1);
}

// ── Betriebssystem-Locale ──
export function GetOSLocale() {
    return window['go']['main']['App']['GetOSLocale']();
}

// ── Disk-Nutzung nach Ordner ──
export function GetDiskUsageByFolder() {
    return window['go']['main']['App']['GetDiskUsageByFolder']();
}

// ── Zertifikats-Check ──
export function ScanCertificates() {
    return window['go']['main']['App']['ScanCertificates']();
}

// ── Fleet-Sync (#74): Kundenverwaltung ──
export function GetClients() {
    return window['go']['main']['App']['GetClients']();
}
export function SaveClient(arg1) {
    return window['go']['main']['App']['SaveClient'](arg1);
}
export function DeleteClient(arg1) {
    return window['go']['main']['App']['DeleteClient'](arg1);
}

// ── Fleet-Sync (#74): Hub-Rolle ──
export function StartHub() {
    return window['go']['main']['App']['StartHub']();
}
export function StopHub() {
    return window['go']['main']['App']['StopHub']();
}
export function GetHubStatus() {
    return window['go']['main']['App']['GetHubStatus']();
}
export function GetHubPairingCode() {
    return window['go']['main']['App']['GetHubPairingCode']();
}

// ── Fleet-Sync (#74): Client-Rolle ──
export function DiscoverHubs() {
    return window['go']['main']['App']['DiscoverHubs']();
}
export function PairWithHub(arg1, arg2) {
    return window['go']['main']['App']['PairWithHub'](arg1, arg2);
}
export function PushSessionToHub(arg1) {
    return window['go']['main']['App']['PushSessionToHub'](arg1);
}
export function GetFleetOverview() {
    return window['go']['main']['App']['GetFleetOverview']();
}

// ── Fleet-Sync (#74): Air-Gap-Bundles + Session-Dialog ──
export function ExportSessionBundle(arg1) {
    return window['go']['main']['App']['ExportSessionBundle'](arg1);
}
export function ImportSessionBundle() {
    return window['go']['main']['App']['ImportSessionBundle']();
}
export function NewCustomerSession(arg1, arg2, arg3) {
    return window['go']['main']['App']['NewCustomerSession'](arg1, arg2, arg3);
}

// ── Fleet-Sync (#74): Übersicht + Rolle ──
export function GetFleetSummary() {
    return window['go']['main']['App']['GetFleetSummary']();
}
export function SyncRole() {
    return window['go']['main']['App']['SyncRole']();
}
export function ExportFleetReport() {
    return window['go']['main']['App']['ExportFleetReport']();
}

// ── Paketverwaltung (#84–#87) ──
export function GetPackageManagerStatus() {
    return window['go']['main']['App']['GetPackageManagerStatus']();
}
export function GetInstalledPackages() {
    return window['go']['main']['App']['GetInstalledPackages']();
}
export function GetOutdatedPackages(arg1) {
    return window['go']['main']['App']['GetOutdatedPackages'](arg1);
}
export function SearchPackages(arg1) {
    return window['go']['main']['App']['SearchPackages'](arg1);
}
export function GetPackageCommand(arg1, arg2, arg3) {
    return window['go']['main']['App']['GetPackageCommand'](arg1, arg2, arg3);
}
export function InstallPackages(arg1, arg2) {
    return window['go']['main']['App']['InstallPackages'](arg1, arg2);
}
export function UpgradePackages(arg1, arg2) {
    return window['go']['main']['App']['UpgradePackages'](arg1, arg2);
}
export function UninstallPackage(arg1, arg2) {
    return window['go']['main']['App']['UninstallPackage'](arg1, arg2);
}
export function SetPackagePinned(arg1, arg2) {
    return window['go']['main']['App']['SetPackagePinned'](arg1, arg2);
}
export function CancelPackageOperation() {
    return window['go']['main']['App']['CancelPackageOperation']();
}

// ── Paketverwaltung P3: Infos ──
export function GetPackageInfo(arg1, arg2) {
    return window['go']['main']['App']['GetPackageInfo'](arg1, arg2);
}

// ── Paketverwaltung P4: Favoriten ──
export function GetFavorites() {
    return window['go']['main']['App']['GetFavorites']();
}
export function SaveFavorites(arg1) {
    return window['go']['main']['App']['SaveFavorites'](arg1);
}
export function ResolveProfile(arg1) {
    return window['go']['main']['App']['ResolveProfile'](arg1);
}
export function ImportFavorites() {
    return window['go']['main']['App']['ImportFavorites']();
}
export function ExportFavorites(arg1) {
    return window['go']['main']['App']['ExportFavorites'](arg1);
}

// ── Werkzeugkasten W1: Zustand ──
export function GetToolStates() {
    return window['go']['main']['App']['GetToolStates']();
}
export function SaveToolState(arg1, arg2) {
    return window['go']['main']['App']['SaveToolState'](arg1, arg2);
}

// ── Werkzeugkasten W4: Links ──
export function GetLinks() {
    return window['go']['main']['App']['GetLinks']();
}
export function SaveLinks(arg1) {
    return window['go']['main']['App']['SaveLinks'](arg1);
}

// ── Werkzeugkasten W2 ──
export function PickFileForHash() {
    return window['go']['main']['App']['PickFileForHash']();
}
export function HashFile(arg1) {
    return window['go']['main']['App']['HashFile'](arg1);
}
export function CancelHash() {
    return window['go']['main']['App']['CancelHash']();
}
export function ExportDocument(arg1, arg2, arg3, arg4, arg5, arg6) {
    return window['go']['main']['App']['ExportDocument'](arg1, arg2, arg3, arg4, arg5, arg6);
}
export function RecordWork(arg1, arg2) {
    return window['go']['main']['App']['RecordWork'](arg1, arg2);
}
export function GetSessionTiming() {
    return window['go']['main']['App']['GetSessionTiming']();
}
export function OpenTextFileDialog(arg1, arg2) {
    return window['go']['main']['App']['OpenTextFileDialog'](arg1, arg2);
}
export function SaveDataURL(arg1, arg2) {
    return window['go']['main']['App']['SaveDataURL'](arg1, arg2);
}

// ── Werkzeugkasten W3: Netz & Sicherheit ──
export function DNSQuery(arg1, arg2, arg3) {
    return window['go']['main']['App']['DNSQuery'](arg1, arg2, arg3);
}
export function GetResolverChoices() {
    return window['go']['main']['App']['GetResolverChoices']();
}
export function SMTPProbe(arg1, arg2) {
    return window['go']['main']['App']['SMTPProbe'](arg1, arg2);
}
export function RDAPLookup(arg1) {
    return window['go']['main']['App']['RDAPLookup'](arg1);
}
export function LinkPreview(arg1) {
    return window['go']['main']['App']['LinkPreview'](arg1);
}
export function URLScanSearch(arg1) {
    return window['go']['main']['App']['URLScanSearch'](arg1);
}
export function SaveSessionNote(arg1, arg2, arg3, arg4) {
    return window['go']['main']['App']['SaveSessionNote'](arg1, arg2, arg3, arg4);
}
