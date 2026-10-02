import {
  ArrowDown,
  ArrowSquareOut,
  CheckCircle,
  Clock,
  FileText,
  FilmStrip,
  FolderOpen,
  GearSix,
  House,
  LinkSimple,
  MagnifyingGlass,
  Moon,
  Plus,
  SpinnerGap,
  Sun,
  UploadSimple,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import type { ImportMode, ProviderInput } from '../shared/api';
import type { Asset, Inspection, Provider, Report, Task } from '../shared/generated';
import { Button, Dialog, EmptyState } from './components/ui';
import { AssetDetail } from './features/asset-detail';
import { ProviderDialog } from './features/provider-dialog';
import { ReportDetail } from './features/report-detail';
import { bytes, duration, errorMessage, isActive, taskStatus } from './lib/format';

type View = 'workspace' | 'tasks' | 'library' | 'documents' | 'settings';
const navigation = [
  { id: 'workspace', label: '工作区', icon: House },
  { id: 'tasks', label: '任务', icon: Clock },
  { id: 'library', label: '媒体库', icon: FilmStrip },
  { id: 'documents', label: '剧本与报告', icon: FileText },
  { id: 'settings', label: '设置', icon: GearSix },
] as const;

export function App() {
  const client = useQueryClient();
  const [view, setView] = useState<View>('workspace');
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [providerDialog, setProviderDialog] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark');
  const [dragging, setDragging] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>('reference');
  const runtime = useQuery({
    queryKey: ['runtime'],
    queryFn: () => window.desktop.getRuntime(),
    refetchInterval: (q) => (q.state.data?.state === 'ready' ? 10000 : 1000),
  });
  const ready = runtime.data?.state === 'ready';
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => window.desktop.getSettings(),
  });
  const tasks = useQuery({
    queryKey: ['tasks'],
    queryFn: () => window.desktop.getTasks(),
    enabled: ready,
    refetchInterval: (q) => (q.state.data?.some(isActive) ? 1500 : false),
  });
  const assets = useQuery({
    queryKey: ['assets'],
    queryFn: () => window.desktop.getAssets(),
    enabled: ready,
  });
  const reports = useQuery({
    queryKey: ['reports'],
    queryFn: () => window.desktop.getReports(),
    enabled: ready,
  });
  const providers = useQuery({
    queryKey: ['providers'],
    queryFn: () => window.desktop.getProviders(),
    enabled: ready,
  });
  const refresh = useCallback(() => {
    void client.invalidateQueries();
  }, [client]);
  const notify = useCallback((message: string) => setNotice(message), []);
  useEffect(
    () =>
      window.desktop.subscribe((event) => {
        if (event.type === 'runtime.changed') client.setQueryData(['runtime'], event.runtime);
        else {
          void client.invalidateQueries({ queryKey: ['tasks'] });
          if (event.type === 'assets.changed')
            void client.invalidateQueries({ queryKey: ['assets'] });
          if (event.type === 'reports.changed')
            void client.invalidateQueries({ queryKey: ['reports'] });
        }
      }),
    [client],
  );
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);
  useEffect(() => {
    if (notice) {
      const timeout = setTimeout(() => setNotice(null), 6000);
      return () => clearTimeout(timeout);
    }
  }, [notice]);
  const importFiles = useMutation({
    mutationFn: () => window.desktop.chooseAndImport(importMode),
    onSuccess: (result) => {
      if (result.length) {
        setView('tasks');
        refresh();
      }
    },
    onError: (e) => notify(errorMessage(e)),
  });
  const operation = async (action: () => Promise<unknown>) => {
    try {
      await action();
      refresh();
    } catch (e) {
      notify(errorMessage(e));
    }
  };
  const activeCount = tasks.data?.filter(isActive).length ?? 0;

  useEffect(() => {
    const dragOver = (event: DragEvent) => {
      event.preventDefault();
      if (event.dataTransfer?.types.includes('Files')) setDragging(true);
    };
    const dragLeave = (event: DragEvent) => {
      if (!event.relatedTarget) setDragging(false);
    };
    const drop = (event: DragEvent) => {
      event.preventDefault();
      setDragging(false);
      if (!ready || !event.dataTransfer) return;
      const files = Array.from(event.dataTransfer.files);
      if (!files.length) return;
      void window.desktop
        .importDropped(files, importMode)
        .then(() => {
          setView('tasks');
          refresh();
        })
        .catch((error) => notify(errorMessage(error)));
    };
    window.addEventListener('dragover', dragOver);
    window.addEventListener('dragleave', dragLeave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', dragOver);
      window.removeEventListener('dragleave', dragLeave);
      window.removeEventListener('drop', drop);
    };
  }, [ready, refresh, notify, importMode]);

  return (
    <div className="desktop-shell">
      <div className="window-drag-region" />
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <FilmStrip size={24} weight="fill" />
          </span>
          <span>
            帧取<small>DESKTOP</small>
          </span>
        </div>
        <nav aria-label="主导航">
          {navigation.map((item) => (
            <button
              type="button"
              key={item.id}
              className={`nav-item ${view === item.id ? 'selected' : ''}`}
              aria-current={view === item.id ? 'page' : undefined}
              onClick={() => {
                setView(item.id);
                setSelectedAsset(null);
                setSelectedReport(null);
              }}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
              {item.id === 'tasks' && activeCount > 0 && (
                <span className="nav-count">{activeCount}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className={`runtime-dot ${ready ? 'ready' : ''}`} />
          <span>
            {ready
              ? '本地工作站已就绪'
              : runtime.data?.state === 'error'
                ? '需要检查运行环境'
                : '正在准备工作站'}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDark(!dark)}
            aria-label={dark ? '切换浅色主题' : '切换深色主题'}
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </Button>
        </div>
      </aside>
      <main className="main-content">
        {!ready && (
          <div className="runtime-notice" role="status">
            <WarningCircle size={20} />
            <div>
              <strong>
                {runtime.data?.state === 'error' ? '本地引擎尚未就绪' : '正在启动本地引擎'}
              </strong>
              <p>{runtime.data?.message ?? '首次启动正在准备本地工作目录。'}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={refresh}>
              重新检查
            </Button>
          </div>
        )}
        {selectedAsset ? (
          <AssetDetail
            asset={selectedAsset}
            providers={providers.data ?? []}
            onBack={() => setSelectedAsset(null)}
            onAnalyze={(providerId, skill) =>
              operation(async () => {
                await window.desktop.analyze({
                  asset_id: selectedAsset.id,
                  provider_id: providerId,
                  skill,
                });
                setSelectedAsset(null);
                setView('tasks');
              })
            }
            onError={notify}
          />
        ) : selectedReport ? (
          <ReportDetail
            report={selectedReport}
            onBack={() => setSelectedReport(null)}
            onError={notify}
          />
        ) : view === 'workspace' ? (
          <Workspace
            ready={ready}
            importMode={importMode}
            onImportMode={setImportMode}
            busy={importFiles.isPending}
            onImport={() => importFiles.mutate()}
            onTaskCreated={() => {
              refresh();
              setView('tasks');
            }}
            onError={notify}
            tasks={tasks.data ?? []}
            onViewTasks={() => setView('tasks')}
          />
        ) : view === 'tasks' ? (
          <Tasks
            tasks={tasks.data ?? []}
            error={tasks.error}
            onCancel={(id) => operation(() => window.desktop.cancelTask(id))}
            onRetry={(id) => {
              const task = tasks.data?.find((item) => item.id === id);
              if (task?.kind === 'analysis') {
                const asset = assets.data?.find((item) => item.id === task.asset_id);
                if (asset) setSelectedAsset(asset);
                else notify('请在媒体库或剧本文档中重新选择素材。');
              } else void operation(() => window.desktop.retryTask(id));
            }}
            onOpen={(id) => operation(() => window.desktop.revealAsset(id))}
            onRefresh={refresh}
          />
        ) : view === 'library' ? (
          <Library
            assets={(assets.data ?? []).filter((a) => a.kind === 'video')}
            error={assets.error}
            onSelect={setSelectedAsset}
            onImport={() => importFiles.mutate()}
            ready={ready}
          />
        ) : view === 'documents' ? (
          <Documents
            assets={(assets.data ?? []).filter((a) => a.kind === 'document')}
            reports={reports.data ?? []}
            error={assets.error ?? reports.error}
            onSelect={setSelectedAsset}
            onReport={setSelectedReport}
            onImport={() => importFiles.mutate()}
            ready={ready}
          />
        ) : (
          <Settings
            settings={settings.data}
            runtime={runtime.data}
            providers={providers.data ?? []}
            ready={ready}
            onAdd={() => {
              setEditingProvider(null);
              setProviderDialog(true);
            }}
            onEdit={(p) => {
              setEditingProvider(p);
              setProviderDialog(true);
            }}
            onRemove={(p) => operation(() => window.desktop.deleteProvider(p.id))}
            onLibrary={() =>
              operation(async () => {
                await window.desktop.chooseLibrary();
              })
            }
          />
        )}
      </main>
      {dragging && (
        <div className="drop-overlay">
          <UploadSimple size={40} />
          <strong>拖入本地视频或剧本文档</strong>
          <span>文件留在本机，导入后可播放或分析</span>
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          <WarningCircle size={19} />
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="关闭提示">
            <X size={16} />
          </button>
        </div>
      )}
      <ProviderDialog
        open={providerDialog}
        provider={editingProvider}
        onOpenChange={setProviderDialog}
        onSave={async (input: ProviderInput) => {
          await window.desktop.saveProvider(input);
          refresh();
        }}
      />
    </div>
  );
}

function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}
function QueryError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return error ? (
    <div className="query-error" role="alert">
      <WarningCircle size={18} />
      <span>{errorMessage(error)}</span>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          重试
        </Button>
      )}
    </div>
  ) : null;
}

function Workspace({
  ready,
  importMode,
  onImportMode,
  busy,
  onImport,
  onTaskCreated,
  onError,
  tasks,
  onViewTasks,
}: {
  ready: boolean;
  importMode: ImportMode;
  onImportMode(mode: ImportMode): void;
  busy: boolean;
  onImport(): void;
  onTaskCreated(): void;
  onError(message: string): void;
  tasks: Task[];
  onViewTasks(): void;
}) {
  const [url, setUrl] = useState('');
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [selectedFormat, setSelectedFormat] = useState('');
  const inspect = useMutation({
    mutationFn: () => window.desktop.inspect(url.trim()),
    onSuccess: (result) => {
      setInspection(result);
      setSelectedFormat(result.formats[0]?.id ?? '');
    },
    onError: (e) => onError(errorMessage(e)),
  });
  const download = useMutation({
    mutationFn: () => {
      if (!inspection) throw new Error('请先解析链接');
      const format = inspection.formats.find((f) => f.id === selectedFormat);
      return window.desktop.download({
        url: inspection.url,
        format_id: format?.id ?? null,
        height: format?.height ?? null,
        container:
          format?.ext === 'mp4' || format?.ext === 'webm' || format?.ext === 'mkv'
            ? format.ext
            : null,
        operation_id: crypto.randomUUID(),
      });
    },
    onSuccess: onTaskCreated,
    onError: (e) => onError(errorMessage(e)),
  });
  return (
    <>
      <div className="workspace-heading">
        <span className="eyebrow">你的本地视频工作站</span>
        <h1>
          从一个链接，
          <br />
          或一份本地文件开始。
        </h1>
        <p>下载、整理与分析，工作内容保存在这台电脑。</p>
      </div>
      <form
        className="intake-form"
        onSubmit={(e) => {
          e.preventDefault();
          setInspection(null);
          inspect.mutate();
        }}
      >
        <LinkSimple size={22} />
        <input
          aria-label="视频链接"
          placeholder="粘贴公开的视频链接"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setInspection(null);
          }}
          type="url"
          required
          disabled={!ready}
        />
        <Button type="submit" disabled={!ready || !url.trim() || inspect.isPending}>
          {inspect.isPending ? (
            <SpinnerGap className="spin" size={18} />
          ) : (
            <MagnifyingGlass size={18} />
          )}
          解析链接
        </Button>
      </form>
      {inspection && (
        <div className="inspection-panel">
          <div>
            <span className="eyebrow">{inspection.platform}</span>
            <h2>{inspection.title}</h2>
            <p className="muted">
              {duration(inspection.duration_seconds)} · {inspection.formats.length} 种规格
            </p>
          </div>
          {inspection.can_download ? (
            <div className="inspection-controls">
              <select
                aria-label="下载规格"
                value={selectedFormat}
                onChange={(e) => setSelectedFormat(e.target.value)}
              >
                {inspection.formats.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
              <Button disabled={download.isPending} onClick={() => download.mutate()}>
                <ArrowDown size={18} />
                保存到媒体库
              </Button>
            </div>
          ) : (
            <p className="muted">
              {inspection.reason ?? '当前来源未通过下载检查，请导入已取得的文件。'}
            </p>
          )}
        </div>
      )}
      <div className="intake-alternative">
        <span>或者导入本地内容</span>
      </div>
      <div className="import-mode">
        <label htmlFor="import-mode">导入方式</label>
        <select
          id="import-mode"
          value={importMode}
          onChange={(event) => onImportMode(event.target.value as ImportMode)}
        >
          <option value="reference">引用原文件</option>
          <option value="copy">复制到媒体库</option>
        </select>
      </div>
      <div className="import-grid">
        <button type="button" className="import-card" onClick={onImport} disabled={!ready || busy}>
          <span className="card-icon">
            <FilmStrip size={27} />
          </span>
          <h2>视频文件</h2>
          <p>本地 MP4，直接播放与分析</p>
          <span className="text-action">
            选择文件 <ArrowSquareOut size={15} />
          </span>
        </button>
        <button type="button" className="import-card" onClick={onImport} disabled={!ready || busy}>
          <span className="card-icon">
            <FileText size={27} />
          </span>
          <h2>剧本文档</h2>
          <p>TXT、Markdown、Fountain、PDF、DOCX</p>
          <span className="text-action">
            选择文件 <ArrowSquareOut size={15} />
          </span>
        </button>
      </div>
      <p className="local-hint">
        <FolderOpen size={16} />
        {importMode === 'reference'
          ? '也可以拖入窗口。引用保留原文件位置，不占用双份空间。'
          : '也可以拖入窗口。托管副本保存在媒体库，原文件移动后仍可使用。'}
      </p>
      {tasks.length > 0 && (
        <section className="recent-section">
          <div className="section-heading">
            <h2>最近任务</h2>
            <Button variant="ghost" size="sm" onClick={onViewTasks}>
              查看全部 <ArrowSquareOut size={15} />
            </Button>
          </div>
          {tasks.slice(0, 3).map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </section>
      )}
    </>
  );
}

function TaskRow({ task, actions }: { task: Task; actions?: React.ReactNode }) {
  const working = isActive(task);
  return (
    <div className="task-row">
      <span
        className={`task-icon ${task.status === 'failed' || task.status === 'needs_attention' ? 'danger' : ''}`}
      >
        {working ? (
          <SpinnerGap size={21} className="spin" />
        ) : task.status === 'succeeded' ? (
          <CheckCircle size={21} />
        ) : task.status === 'failed' || task.status === 'needs_attention' ? (
          <WarningCircle size={21} />
        ) : (
          <Clock size={21} />
        )}
      </span>
      <div className="task-info">
        <strong>{task.message || task.stage || '任务'}</strong>
        <div className="task-meta">
          <span>{taskStatus(task)}</span>
          <span>
            {task.kind === 'analysis'
              ? 'AI 分析'
              : task.kind === 'download'
                ? '视频下载'
                : '本地导入'}
          </span>
          {task.error_code && <span>{task.error_code}</span>}
        </div>
        {working && task.progress != null && (
          <progress
            max={1}
            value={task.progress > 1 ? task.progress / 100 : task.progress}
            aria-label="任务进度"
          />
        )}
      </div>
      <div className="task-actions">{actions}</div>
    </div>
  );
}
function Tasks({
  tasks,
  error,
  onCancel,
  onRetry,
  onOpen,
  onRefresh,
}: {
  tasks: Task[];
  error: unknown;
  onCancel(id: string): void;
  onRetry(id: string): void;
  onOpen(id: string): void;
  onRefresh(): void;
}) {
  return (
    <>
      <PageHeader
        title="任务"
        description="下载、导入与分析的进度保存在本机。"
        action={
          <Button variant="secondary" onClick={onRefresh}>
            刷新
          </Button>
        }
      />
      <QueryError error={error} onRetry={onRefresh} />
      {tasks.length === 0 ? (
        <EmptyState
          icon={<Clock size={28} />}
          title="还没有任务"
          description="从工作区导入一份文件，或解析一个视频链接。"
        />
      ) : (
        <div className="task-list">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              actions={
                <>
                  {isActive(task) && task.status !== 'cancelling' && (
                    <Button variant="ghost" size="sm" onClick={() => onCancel(task.id)}>
                      取消
                    </Button>
                  )}
                  {['failed', 'interrupted', 'cancelled', 'needs_attention'].includes(
                    task.status,
                  ) && (
                    <Button variant="secondary" size="sm" onClick={() => onRetry(task.id)}>
                      {task.kind === 'analysis' ? '查看素材并重新分析' : '重试'}
                    </Button>
                  )}
                  {task.status === 'needs_attention' && (
                    <small className="muted">再次调用可能产生费用</small>
                  )}
                  {task.asset_id && task.status === 'succeeded' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onOpen(task.asset_id as string)}
                    >
                      <FolderOpen size={17} />
                      显示文件
                    </Button>
                  )}
                </>
              }
            />
          ))}
        </div>
      )}
    </>
  );
}
function Library({
  assets,
  error,
  onSelect,
  onImport,
  ready,
}: {
  assets: Asset[];
  error: unknown;
  onSelect(asset: Asset): void;
  onImport(): void;
  ready: boolean;
}) {
  const [search, setSearch] = useState('');
  const filtered = assets.filter((a) => a.title.toLowerCase().includes(search.toLowerCase()));
  return (
    <>
      <PageHeader
        title="媒体库"
        description="原文件、元数据与分析结果，都在这台电脑。"
        action={
          <Button onClick={onImport} disabled={!ready}>
            <Plus size={18} />
            导入文件
          </Button>
        }
      />
      <QueryError error={error} />
      <div className="search-field">
        <MagnifyingGlass size={18} />
        <input
          aria-label="搜索媒体"
          placeholder="搜索媒体名称"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {filtered.length ? (
        <div className="media-grid">
          {filtered.map((asset) => (
            <MediaCard key={asset.id} asset={asset} onSelect={onSelect} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<FilmStrip size={30} />}
          title={search ? '没有匹配的媒体' : '媒体库还是空的'}
          description={
            search ? '试试其他名称。' : '导入视频后，这里会保存封面、元数据与本地播放入口。'
          }
        />
      )}
    </>
  );
}
function MediaCard({ asset, onSelect }: { asset: Asset; onSelect(asset: Asset): void }) {
  const thumbnail = useQuery({
    queryKey: ['thumbnail', asset.id],
    queryFn: () => window.desktop.mediaUrl(asset.id, 'thumbnail'),
    retry: false,
  });
  return (
    <button type="button" className="media-card" onClick={() => onSelect(asset)}>
      <div className="thumbnail">
        {thumbnail.data ? <img src={thumbnail.data} alt="" /> : <FilmStrip size={32} />}
        <span>{duration(asset.duration_seconds)}</span>
      </div>
      <h3>{asset.title}</h3>
      <p>
        {asset.width && asset.height ? `${asset.width} × ${asset.height} · ` : ''}
        {bytes(asset.size_bytes)}
        {asset.availability !== 'available' &&
          ` · ${asset.availability === 'missing' ? '文件缺失' : '文件已变更'}`}
      </p>
    </button>
  );
}
function Documents({
  assets,
  reports,
  error,
  onSelect,
  onReport,
  onImport,
  ready,
}: {
  assets: Asset[];
  reports: Report[];
  error: unknown;
  onSelect(asset: Asset): void;
  onReport(report: Report): void;
  onImport(): void;
  ready: boolean;
}) {
  return (
    <>
      <PageHeader
        title="剧本与报告"
        description="阅读本地文档，查看分析结果并导出报告。"
        action={
          <Button onClick={onImport} disabled={!ready}>
            <Plus size={18} />
            导入文档
          </Button>
        }
      />
      <QueryError error={error} />
      <section>
        <h2 className="section-title">剧本文档</h2>
        {assets.length ? (
          <div className="document-list">
            {assets.map((asset) => (
              <button
                type="button"
                className="document-row"
                key={asset.id}
                onClick={() => onSelect(asset)}
              >
                <FileText size={25} />
                <div>
                  <strong>{asset.title}</strong>
                  <p>
                    {bytes(asset.size_bytes)} · {asset.text_preview?.slice(0, 90) ?? '本地文档'}
                  </p>
                </div>
                <ArrowSquareOut size={18} />
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<FileText size={28} />}
            title="还没有剧本文档"
            description="支持文本、Markdown、Fountain、文字型 PDF 和 DOCX。"
          />
        )}
      </section>
      <section className="reports-section">
        <h2 className="section-title">分析报告</h2>
        {reports.length ? (
          <div className="document-list">
            {reports.map((report) => (
              <button
                type="button"
                className="document-row"
                key={report.id}
                onClick={() => onReport(report)}
              >
                <CheckCircle size={25} />
                <div>
                  <strong>{report.title}</strong>
                  <p>{report.summary}</p>
                </div>
                <ArrowSquareOut size={18} />
              </button>
            ))}
          </div>
        ) : (
          <p className="muted">完成视频或剧本分析后，报告会保存在这里，可离线阅读。</p>
        )}
      </section>
    </>
  );
}
function Settings({
  settings,
  runtime,
  providers,
  ready,
  onAdd,
  onEdit,
  onRemove,
  onLibrary,
}: {
  settings: { library_dir: string; data_dir: string; app_version: string } | undefined;
  runtime:
    | {
        state: string;
        message: string | null;
        hello: { resources: { ffmpeg: boolean; ffprobe: boolean; yt_dlp: boolean } } | null;
      }
    | undefined;
  providers: Provider[];
  ready: boolean;
  onAdd(): void;
  onEdit(provider: Provider): void;
  onRemove(provider: Provider): void;
  onLibrary(): void;
}) {
  const [remove, setRemove] = useState<Provider | null>(null);
  return (
    <>
      <PageHeader title="设置" description="管理本地工作目录与可选模型服务。" />
      <section className="settings-section">
        <h2>工作目录</h2>
        <p className="muted">下载与托管副本保存到媒体库，引用导入保留原文件位置。</p>
        <div className="setting-row">
          <div>
            <strong>媒体库</strong>
            <code>{settings?.library_dir ?? '正在读取…'}</code>
          </div>
          <Button variant="secondary" disabled={!ready} onClick={onLibrary}>
            选择目录
          </Button>
        </div>
        <div className="setting-row">
          <div>
            <strong>本地数据</strong>
            <code>{settings?.data_dir ?? '正在读取…'}</code>
          </div>
          <span className="muted">任务与索引</span>
        </div>
      </section>
      <section className="settings-section">
        <div className="section-heading">
          <h2>模型服务</h2>
          <Button variant="secondary" disabled={!ready} onClick={onAdd}>
            <Plus size={17} />
            添加服务
          </Button>
        </div>
        <p className="muted">
          分析时会将必要文本或抽帧发送到你选择的服务。未配置模型也可以下载、导入和播放。
        </p>
        {providers.length ? (
          providers.map((p) => (
            <div className="setting-row" key={p.id}>
              <div>
                <strong>{p.label}</strong>
                <p>
                  {p.model} · {p.vision ? '视觉输入已启用' : '文本输入'} ·{' '}
                  {p.key_set ? '密钥已配置' : '未配置密钥'}
                </p>
              </div>
              <div className="inline-actions">
                <Button variant="ghost" size="sm" onClick={() => onEdit(p)}>
                  编辑
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setRemove(p)}>
                  删除
                </Button>
              </div>
            </div>
          ))
        ) : (
          <div className="muted settings-empty">
            还没有模型服务。使用自己的兼容 API 即可开始分析。
          </div>
        )}
      </section>
      <section className="settings-section">
        <h2>运行环境</h2>
        <div className="setting-row">
          <span>本地引擎</span>
          <span>{runtime?.state === 'ready' ? '已就绪' : (runtime?.message ?? '准备中')}</span>
        </div>
        {runtime?.hello &&
          Object.entries(runtime.hello.resources).map(([name, available]) => (
            <div className="setting-row" key={name}>
              <span>
                {name === 'yt_dlp'
                  ? '视频解析器'
                  : name === 'ffprobe'
                    ? '媒体元数据工具'
                    : '媒体处理工具'}
              </span>
              <span>{available ? '可用' : '未就绪'}</span>
            </div>
          ))}
        <div className="setting-row">
          <span>应用版本</span>
          <span>{settings?.app_version ?? '0.1.0'}</span>
        </div>
      </section>
      <Dialog
        open={!!remove}
        onOpenChange={(open) => {
          if (!open) setRemove(null);
        }}
        title="删除模型服务"
        description="删除配置和本机保存的密钥，已有分析报告会保留。"
      >
        <div className="dialog-actions">
          <Button variant="secondary" onClick={() => setRemove(null)}>
            取消
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (remove) onRemove(remove);
              setRemove(null);
            }}
          >
            删除
          </Button>
        </div>
      </Dialog>
    </>
  );
}
