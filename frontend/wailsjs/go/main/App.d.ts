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

// Paketverwaltung P3: Infos
export function GetPackageInfo(ref: any, known: string[]): Promise<any>;

// Paketverwaltung P4: Favoriten
export function GetFavorites(): Promise<any>;
export function SaveFavorites(f: any): Promise<void>;
export function ResolveProfile(name: string): Promise<any[]>;
export function ImportFavorites(): Promise<any>;
export function ExportFavorites(format: string): Promise<string>;

// Werkzeugkasten W1: Zustand
export function GetToolStates(): Promise<Record<string, any>>;
export function SaveToolState(key: string, value: string): Promise<void>;

export function GetDeviceIdentity(): Promise<any>;
export function GetGateways(): Promise<Array<string>>;
export function CertCheck(host: string, port: number, mode: string): Promise<any>;
export function PortCheck(host: string, ports: Array<number>): Promise<Array<any>>;
export function WakeOnLAN(mac: string, broadcast: string, port: number): Promise<void>;
export function ARPTable(): Promise<Array<any>>;
export function ProbeDevice(ip: string): Promise<any>;
export function OpenCommandTarget(target: string, args: Array<string>): Promise<void>;
export function RunCommand(req: any): Promise<any>;
export function IsElevated(): Promise<boolean>;
export function WikiMediaBegin(slug: string, name: string): Promise<string>;
export function WikiMediaChunk(id: string, b64: string): Promise<void>;
export function WikiMediaEnd(id: string): Promise<string>;
export function WikiMediaAbort(id: string): Promise<void>;
export function PickWikiMedia(slug: string): Promise<string>;
export function OpenWikiMedia(rel: string): Promise<void>;
export function CaptureScreenshot(mode: string, delay: number): Promise<string>;
export function CaptureCapabilities(): Promise<Record<string, boolean>>;
export function RecordStart(mic: boolean, clicks: boolean): Promise<void>;
export function RecordStop(slug: string): Promise<string>;
export function MediaToGIF(rel: string, start: number, end: number): Promise<string>;
export function GetInfoCard(): Promise<any>;
export function PublicIP(): Promise<string>;
export function EventTimeline(days: number): Promise<Array<any>>;
export function MonitorStart(targets: Array<any>, maxMinutes: number): Promise<void>;
export function MonitorStop(): Promise<void>;
export function MonitorStatus(since: number): Promise<any>;
export function LocalSubnets(): Promise<Array<string>>;
export function ScanSubnet(cidr: string): Promise<Array<any>>;
export function ImportWikiFolder(copies: boolean): Promise<any>;
export function GetEntries(kind: string): Promise<string>;
export function SaveEntries(kind: string, data: string): Promise<void>;

// Werkzeugkasten W4: Links
export function GetLinks(): Promise<any>;
export function SaveLinks(l: any): Promise<void>;

// Werkzeugkasten W2
export function PickFileForHash(): Promise<string>;
export function HashFile(path: string): Promise<Record<string,string>>;
export function CancelHash(): Promise<void>;
export function ExportDocument(kind: string, title: string, bodyHTML: string, card: boolean, workTitle: string, workDetail: string): Promise<string>;
export function RecordWork(title: string, detail: string): Promise<void>;
export function GetSessionTiming(): Promise<any>;
export function OpenTextFileDialog(title: string, pattern: string): Promise<any>;
export function SaveDataURL(defaultName: string, dataURL: string): Promise<string>;

// Werkzeugkasten W3: Netz & Sicherheit
export function DNSQuery(name: string, rrtype: string, server: string): Promise<any>;
export function GetResolverChoices(): Promise<any[]>;
export function SMTPProbe(host: string, port: number): Promise<any>;
export function RDAPLookup(domain: string): Promise<any>;
export function LinkPreview(url: string): Promise<any>;
export function URLScanSearch(domain: string): Promise<any[]>;
export function SaveSessionNote(folder: string, name: string, markdown: string, workTitle: string): Promise<string>;

// Werkzeugkasten W5: Wiki & Hardwaretest
export function ListWikiArticles(): Promise<any[]>;
export function GetWikiArticle(slug: string): Promise<any>;
export function SaveWikiArticle(a: any): Promise<string>;
export function DeleteWikiArticle(slug: string): Promise<void>;
export function SaveWikiImage(slug: string, name: string, dataURL: string): Promise<string>;
export function OpenSystemApp(kind: string): Promise<void>;

export function ListDocuments(): Promise<any>;

export function CreateDocFolder(parent: string, name: string): Promise<string>;

export function RenameDoc(rel: string, newName: string): Promise<string>;

export function DeleteDoc(rel: string): Promise<void>;

export function ReadDocText(rel: string): Promise<string>;

export function SaveDocText(rel: string, content: string): Promise<void>;

export function ImportDocuments(folder: string): Promise<Array<string>>;

export function OpenDocument(rel: string): Promise<void>;

export function RevealDocument(rel: string): Promise<void>;

export function GetDocumentInfo(): Promise<any>;

export function GetWikiCategories(): Promise<Array<string>>;

export function SaveWikiCategories(cats: Array<string>): Promise<void>;

export function IsSyncAvailable(): Promise<boolean>;

export function GetDiskScanRoots(): Promise<Array<any>>;

export function PickDiskScanFolder(): Promise<string>;

export function StartDiskScan(root: string): Promise<void>;

export function CancelDiskScan(): Promise<void>;

export function GetDiskScanStatus(): Promise<any>;

export function GetDiskNodeChildren(path: string, hideSystem: boolean): Promise<any>;

export function GetDiskTopFiles(limit: number, hideSystem: boolean): Promise<Array<any>>;

export function GetDiskHotspots(limit: number): Promise<Array<any>>;

export function DiskMoveToTrash(path: string): Promise<void>;

export function DiskReportSummary(): Promise<string>;
