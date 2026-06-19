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
