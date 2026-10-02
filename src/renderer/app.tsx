import {
  ClockCounterClockwiseIcon,
  FileTextIcon,
  FolderOpenIcon,
  GearSixIcon,
  HouseIcon,
  ListIcon,
  MoonIcon,
  PulseIcon,
  SparkleIcon,
  SunIcon,
  UploadSimpleIcon,
} from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { ImportMode, ProviderInput } from '../shared/api';
import type { Asset, Provider, Report } from '../shared/generated';
import logo from './assets/logo.svg';
import { Button, buttonVariants, QueryFeedback } from './components/ui';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from './components/ui/dropdown-menu';
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from './components/ui/navigation-menu';
import { Toaster } from './components/ui/sonner';
import { AiServicesView } from './features/ai-services-view';
import { AssetDetail } from './features/asset-detail';
import { AssetsView, ReportsView } from './features/assets-view';
import { PlatformsView } from './features/platforms-view';
import { ProviderDialog } from './features/provider-dialog';
import { ReportDetail } from './features/report-detail';
import { SettingsView } from './features/settings-view';
import { TasksView } from './features/tasks-view';
import { Workspace } from './features/workspace';
import { errorMessage, isActive } from './lib/format';

type View =
  | 'workspace'
  | 'tasks'
  | 'library'
  | 'documents'
  | 'providers'
  | 'reports'
  | 'ai'
  | 'settings';
const navigation = [
  { id: 'workspace', label: '首页', icon: HouseIcon },
  { id: 'tasks', label: '下载记录', icon: ClockCounterClockwiseIcon },
  { id: 'documents', label: '剧本文档', icon: FileTextIcon },
  { id: 'providers', label: '平台状态', icon: PulseIcon },
] as const;
const management = [
  { id: 'library', label: '文件管理', icon: FolderOpenIcon },
  { id: 'reports', label: '分析报告', icon: FileTextIcon },
  { id: 'ai', label: 'AI 服务', icon: SparkleIcon },
  { id: 'settings', label: '设置', icon: GearSixIcon },
] as const;

export function App() {
  const client = useQueryClient();
  const [view, setView] = useState<View>('workspace');
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [reportParent, setReportParent] = useState<Asset | null>(null);
  const [providerDialog, setProviderDialog] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [taskTab, setTaskTab] = useState('download');
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem('framegrab-theme') ?? localStorage.getItem('theme');
    return stored === 'dark';
  });
  const [dragging, setDragging] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>('reference');
  const runtime = useQuery({
    queryKey: ['runtime'],
    queryFn: () => window.desktop.getRuntime(),
    refetchInterval: (query) => (query.state.data?.state === 'ready' ? 10000 : 1000),
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
    refetchInterval: (query) => (query.state.data?.some(isActive) ? 1500 : false),
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
  const notify = useCallback((message: string) => {
    toast.error(message);
  }, []);
  const navigate = (target: View) => {
    setView(target);
    setSelectedAsset(null);
    setSelectedReport(null);
    setReportParent(null);
    if (target === 'tasks') setTaskTab('download');
  };
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
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    localStorage.setItem('framegrab-theme', dark ? 'dark' : 'light');
  }, [dark]);
  const importFiles = useMutation({
    mutationFn: (kind?: 'video' | 'document') => window.desktop.chooseAndImport(importMode, kind),
    onSuccess: (result) => {
      if (result.length) {
        setSelectedAsset(null);
        setSelectedReport(null);
        setView('tasks');
        setTaskTab('import');
        refresh();
        toast.success('已创建导入任务');
      }
    },
    onError: (error) => notify(errorMessage(error)),
  });
  const operation = async (action: () => Promise<unknown>) => {
    try {
      await action();
      refresh();
    } catch (error) {
      notify(errorMessage(error));
    }
  };
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
          setSelectedAsset(null);
          setSelectedReport(null);
          setView('tasks');
          setTaskTab('import');
          refresh();
          toast.success('已创建导入任务');
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
  const currentAsset =
    assets.data?.find((asset) => asset.id === selectedAsset?.id) ?? selectedAsset;
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground" data-slot="basic-layout">
      <header className="sticky top-0 z-40 bg-background">
        <div className="content-shell flex h-16 items-center justify-between gap-3">
          <button
            type="button"
            aria-label="帧取首页"
            className="focus-ring inline-flex shrink-0 items-center gap-3 rounded-md text-lg font-semibold tracking-tight"
            onClick={() => navigate('workspace')}
          >
            <img src={logo} alt="" aria-hidden width={32} height={32} className="size-8 shrink-0" />
            <span>帧取</span>
          </button>
          <div className="flex min-w-0 items-center gap-2">
            <NavigationMenu className="hidden lg:flex" aria-label="主要导航" viewport={false}>
              <NavigationMenuList className="gap-2">
                {navigation.map((item) => (
                  <NavigationMenuItem key={item.id}>
                    <NavigationMenuLink
                      active={view === item.id}
                      asChild
                      className={buttonVariants({ variant: 'ghost' })}
                    >
                      <button
                        type="button"
                        aria-current={view === item.id ? 'page' : undefined}
                        onClick={() => navigate(item.id)}
                      >
                        <item.icon aria-hidden />
                        {item.label}
                      </button>
                    </NavigationMenuLink>
                  </NavigationMenuItem>
                ))}
              </NavigationMenuList>
            </NavigationMenu>
            <Button
              variant="ghost"
              size="icon"
              aria-label={dark ? '切换浅色主题' : '切换深色主题'}
              onClick={() => setDark(!dark)}
            >
              {dark ? <SunIcon /> : <MoonIcon />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" aria-label="管理">
                  <GearSixIcon data-icon="inline-start" />
                  <span className="hidden sm:inline">管理</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>管理</DropdownMenuLabel>
                  {management.map((item) => (
                    <DropdownMenuItem key={item.id} onSelect={() => navigate(item.id)}>
                      <item.icon aria-hidden />
                      {item.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="lg:hidden" variant="ghost" size="icon" aria-label="打开导航菜单">
                  <ListIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>工作区</DropdownMenuLabel>
                  {navigation.map((item) => (
                    <DropdownMenuItem key={item.id} onSelect={() => navigate(item.id)}>
                      <item.icon aria-hidden />
                      {item.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <main
        id="main-content"
        className="content-shell flex flex-1 flex-col"
        data-slot="basic-layout-main"
      >
        <div className="inner-page flex flex-col gap-8">
          {!ready && (
            <QueryFeedback
              title={runtime.data?.state === 'error' ? '本地引擎尚未就绪' : '正在启动本地引擎'}
              error={new Error(runtime.data?.message ?? '正在准备本地工作目录，请稍候。')}
              onRetry={refresh}
              compact
            />
          )}
          {currentAsset ? (
            <AssetDetail
              asset={currentAsset}
              providers={providers.data ?? []}
              reports={(reports.data ?? []).filter((report) => report.asset_id === currentAsset.id)}
              onBack={() => setSelectedAsset(null)}
              onReport={(report) => {
                setReportParent(currentAsset);
                setSelectedAsset(null);
                setSelectedReport(report);
              }}
              onConfigure={() => navigate('ai')}
              onImport={() => importFiles.mutate(currentAsset.kind)}
              onError={notify}
              onAnalyze={(providerId, skill) =>
                operation(async () => {
                  await window.desktop.analyze({
                    asset_id: currentAsset.id,
                    provider_id: providerId,
                    skill,
                  });
                  setSelectedAsset(null);
                  setView('tasks');
                  setTaskTab('analysis');
                  toast.success('已创建分析任务');
                })
              }
            />
          ) : selectedReport ? (
            <ReportDetail
              report={selectedReport}
              onBack={() => {
                setSelectedReport(null);
                setSelectedAsset(reportParent);
                setReportParent(null);
              }}
              onError={notify}
            />
          ) : view === 'workspace' ? (
            <Workspace
              ready={ready}
              importMode={importMode}
              onImportMode={setImportMode}
              busy={importFiles.isPending}
              onImport={(kind) => importFiles.mutate(kind)}
              onTaskCreated={() => {
                refresh();
                setView('tasks');
                setTaskTab('download');
              }}
            />
          ) : view === 'tasks' ? (
            <TasksView
              tasks={tasks.data ?? []}
              assets={assets.data ?? []}
              reports={reports.data ?? []}
              pending={tasks.isPending}
              error={tasks.error}
              tab={taskTab}
              onTabChange={setTaskTab}
              onRefresh={refresh}
              onCancel={(id) => operation(() => window.desktop.cancelTask(id))}
              onRetry={(task) => {
                if (task.kind === 'analysis') {
                  const asset = assets.data?.find((item) => item.id === task.asset_id);
                  if (asset) setSelectedAsset(asset);
                  else notify('请重新选择视频或剧本文档。');
                } else void operation(() => window.desktop.retryTask(task.id));
              }}
              onSelect={setSelectedAsset}
              onReports={(asset) => {
                setView(asset.kind === 'document' ? 'documents' : 'library');
                setSelectedAsset(asset);
              }}
            />
          ) : view === 'library' || view === 'documents' ? (
            <AssetsView
              key={view}
              kind={view === 'documents' ? 'document' : 'video'}
              assets={(assets.data ?? []).filter(
                (asset) => asset.kind === (view === 'documents' ? 'document' : 'video'),
              )}
              reports={reports.data ?? []}
              pending={assets.isPending}
              error={assets.error}
              ready={ready}
              onRefresh={refresh}
              onSelect={setSelectedAsset}
              onImport={() => importFiles.mutate(view === 'documents' ? 'document' : 'video')}
            />
          ) : view === 'reports' ? (
            <ReportsView
              reports={reports.data ?? []}
              pending={reports.isPending}
              error={reports.error}
              onRefresh={refresh}
              onSelect={setSelectedReport}
            />
          ) : view === 'providers' ? (
            <PlatformsView />
          ) : view === 'ai' ? (
            <AiServicesView
              providers={providers.data ?? []}
              pending={providers.isPending}
              error={providers.error}
              ready={ready}
              onRefresh={refresh}
              onAdd={() => {
                setEditingProvider(null);
                setProviderDialog(true);
              }}
              onEdit={(provider) => {
                setEditingProvider(provider);
                setProviderDialog(true);
              }}
              onRemove={async (provider) => {
                await window.desktop.deleteProvider(provider.id);
                refresh();
                toast.success('AI 服务已删除');
              }}
            />
          ) : (
            <SettingsView
              settings={settings.data}
              runtime={runtime.data}
              ready={ready}
              onRefresh={refresh}
              onLibrary={() =>
                operation(async () => {
                  const next = await window.desktop.chooseLibrary();
                  if (next) toast.success('文件目录已更新');
                })
              }
            />
          )}
        </div>
      </main>
      <footer className="shrink-0 bg-background">
        <div className="content-shell flex min-h-16 flex-wrap items-center justify-between gap-x-8 gap-y-3 py-5 text-sm text-muted-foreground">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-medium text-foreground">帧取 · FrameFetch</span>
            <span>MIT 开源 · 请仅处理已获授权内容</span>
          </div>
          <span role="status">
            {ready
              ? '本地工作站已就绪'
              : runtime.data?.state === 'error'
                ? '本地引擎尚未就绪'
                : '正在准备工作站'}
          </span>
        </div>
      </footer>
      {dragging && (
        <div
          className="pointer-events-none fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background/95"
          role="status"
        >
          <UploadSimpleIcon size={40} />
          <strong>拖入本地视频或剧本文档</strong>
          <span className="text-muted-foreground">文件保存在本机，导入后可预览或分析。</span>
        </div>
      )}
      <Toaster
        theme={dark ? 'dark' : 'light'}
        position="top-center"
        offset={{ top: 80 }}
        mobileOffset={{ top: 72 }}
      />
      <ProviderDialog
        open={providerDialog}
        provider={editingProvider}
        onOpenChange={setProviderDialog}
        onSave={async (input: ProviderInput) => {
          await window.desktop.saveProvider(input);
          refresh();
          toast.success('AI 服务已保存');
        }}
      />
    </div>
  );
}
