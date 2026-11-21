// Automatisch generierte Wails-Bindings. NICHT MANUELL BEARBEITEN.
// Bei Änderungen an app.go: `wails generate module` ausführen.

export function GetAppVersion(): Promise<string>;
export function GetConfig(): Promise<any>;
export function GetVaultPath(): Promise<string>;
export function NewSession(customerName: string): Promise<string>;

// Phase 2: System-Scan
export function ScanSystem(): Promise<any>;
export function SaveSystemScan(result: any, sessionPath: string): Promise<void>;

// Phase 3: Netzwerk-Scan
export function ScanNetwork(): Promise<any>;
export function SaveNetworkScan(result: any, sessionPath: string): Promise<void>;

// Phase 4: Software-Inventarisierung
export function ScanSoftware(): Promise<any>;
export function SaveSoftwareScan(result: any, sessionPath: string): Promise<void>;

// Phase 5: Tools & Konsolen-Tools
export function RunConsoleTool(tool: string, target: string): Promise<string>;
export function BackupVault(): Promise<string>;
export function GetClipboard(): Promise<string>;
export function GetUptime(): Promise<string>;

// Phase 9: Erweiterte Scanner
export function ScanAutostart(): Promise<any>;
export function ScanServices(): Promise<any>;
export function ScanEvents(): Promise<any>;

// Phase 8: Drucker-Scanner
export function ScanPrinters(): Promise<any>;
export function SavePrinterScan(result: any, sessionPath: string): Promise<void>;

// Phase 6: Export & Einstellungen
export function ExportSession(format: string): Promise<string>;
export function ExportCSV(): Promise<string>;
export function SaveConfig(cfg: any): Promise<void>;
export function PickLogoFile(): Promise<string>;
export function GetLogoBase64(): Promise<string>;

// Fleet-Sync (#74)
export function GetClients(): Promise<any>;
export function SaveClient(customer: any): Promise<any>;
export function DeleteClient(id: string): Promise<void>;
export function StartHub(): Promise<void>;
export function StopHub(): Promise<void>;
export function GetHubStatus(): Promise<any>;
export function GetHubPairingCode(): Promise<string>;
export function DiscoverHubs(): Promise<any>;
export function PairWithHub(baseURL: string, pin: string): Promise<void>;
export function PushSessionToHub(sessionPath: string): Promise<void>;
export function GetFleetOverview(): Promise<any>;
export function ExportSessionBundle(sessionPath: string): Promise<string>;
export function ImportSessionBundle(): Promise<string>;
export function NewCustomerSession(customerName: string, deviceAlias: string, location: string): Promise<string>;
export function GetFleetSummary(): Promise<any>;
export function SyncRole(): Promise<string>;
export function ExportFleetReport(): Promise<string>;

// Paketverwaltung (#84–#87)
export function GetPackageManagerStatus(): Promise<any>;
export function GetInstalledPackages(): Promise<any[]>;
export function GetOutdatedPackages(opts: any): Promise<any[]>;
export function SearchPackages(query: string): Promise<any[]>;
export function GetPackageCommand(action: string, ref: any, opts: any): Promise<string>;
export function InstallPackages(refs: any[], opts: any): Promise<any[]>;
export function UpgradePackages(refs: any[], opts: any): Promise<any[]>;
export function UninstallPackage(ref: any, opts: any): Promise<any>;
export function SetPackagePinned(ref: any, pinned: boolean): Promise<any>;
export function CancelPackageOperation(): Promise<void>;
