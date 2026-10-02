import type {
  AnalysisInput,
  Asset,
  DownloadInput as EngineDownloadInput,
  EngineHello,
  ProviderInput as EngineProviderInput,
  ImportInput,
  Inspection,
  Provider,
  Report,
  Task,
} from './generated';

export type ImportMode = ImportInput['mode'];
export type Skill = AnalysisInput['skill'];
export type ProviderInput = EngineProviderInput & { api_key?: string };
export type DownloadInput = EngineDownloadInput;
export type AnalysisRequest = Omit<
  AnalysisInput,
  'api_key' | 'operation_id' | 'expected_provider_base_url'
>;
export interface RuntimeState {
  state: 'starting' | 'ready' | 'error' | 'stopped';
  message: string | null;
  hello: EngineHello | null;
}
export interface AppSettings {
  library_dir: string;
  data_dir: string;
  app_version: string;
}
export type DesktopEvent =
  | { type: 'runtime.changed'; runtime: RuntimeState }
  | { type: 'tasks.changed'; task_id: string; seq: number; revision: number }
  | { type: 'assets.changed'; asset_id: string; seq: number }
  | { type: 'reports.changed'; report_id: string; seq: number };

export interface DesktopAPI {
  getRuntime(): Promise<RuntimeState>;
  getSettings(): Promise<AppSettings>;
  chooseLibrary(): Promise<AppSettings | null>;
  chooseAndImport(mode: ImportMode, kind?: 'video' | 'document'): Promise<Task[]>;
  importDropped(files: File[], mode: ImportMode): Promise<Task[]>;
  getAssets(): Promise<Asset[]>;
  getTasks(): Promise<Task[]>;
  cancelTask(taskId: string): Promise<Task>;
  retryTask(taskId: string): Promise<Task>;
  inspect(url: string): Promise<Inspection>;
  download(input: DownloadInput): Promise<Task>;
  mediaUrl(assetId: string, kind: 'original' | 'thumbnail'): Promise<string>;
  openAsset(assetId: string): Promise<void>;
  revealAsset(assetId: string): Promise<void>;
  getDocumentText(assetId: string): Promise<string>;
  getProviders(): Promise<Provider[]>;
  saveProvider(input: ProviderInput): Promise<Provider>;
  deleteProvider(providerId: string): Promise<void>;
  analyze(input: AnalysisRequest): Promise<Task>;
  getReports(): Promise<Report[]>;
  getReport(reportId: string): Promise<Report>;
  exportReport(reportId: string, format: 'md' | 'docx'): Promise<boolean>;
  subscribe(listener: (event: DesktopEvent) => void): () => void;
}

declare global {
  interface Window {
    desktop: DesktopAPI;
  }
}
