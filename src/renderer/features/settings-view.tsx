import { ArrowClockwiseIcon, FolderOpenIcon } from '@phosphor-icons/react';
import type { AppSettings, RuntimeState } from '../../shared/api';
import { Button, PageHeader, QueryFeedback } from '../components/ui';
import { Skeleton } from '../components/ui/skeleton';
import { Table, TableBody, TableCaption, TableCell, TableRow } from '../components/ui/table';

const runtimeLabels: Record<RuntimeState['state'], string> = {
  starting: '准备中',
  ready: '已就绪',
  error: '启动失败',
  stopped: '已停止',
};

export function SettingsView({
  settings,
  runtime,
  ready,
  onLibrary,
  onRefresh,
}: {
  settings: AppSettings | undefined;
  runtime: RuntimeState | undefined;
  ready: boolean;
  onLibrary(): void;
  onRefresh(): void;
}) {
  const resources = runtime?.hello?.resources;
  return (
    <>
      <PageHeader
        title="设置"
        description="管理本地工作目录并查看运行环境。"
        action={
          <Button onClick={onRefresh} type="button" variant="outline">
            <ArrowClockwiseIcon aria-hidden data-icon="inline-start" />
            刷新
          </Button>
        }
      />
      <section aria-labelledby="settings-directory-title" className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h2 className="text-base font-medium" id="settings-directory-title">
            工作目录
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            下载文件与复制导入的文件保存在媒体库，引用导入保留原文件位置。
          </p>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <dl className="flex min-w-0 flex-1 flex-col gap-5">
            <div className="flex min-w-0 flex-col gap-2">
              <dt className="text-sm font-medium">媒体库</dt>
              <dd className="break-all text-sm text-muted-foreground">
                {settings ? (
                  settings.library_dir
                ) : (
                  <>
                    <span className="sr-only" role="status">
                      正在读取媒体库目录
                    </span>
                    <Skeleton aria-hidden className="h-5 w-3/4" />
                  </>
                )}
              </dd>
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <dt className="text-sm font-medium">本地数据</dt>
              <dd className="break-all text-sm text-muted-foreground">
                {settings ? (
                  settings.data_dir
                ) : (
                  <>
                    <span className="sr-only" role="status">
                      正在读取本地数据目录
                    </span>
                    <Skeleton aria-hidden className="h-5 w-3/4" />
                  </>
                )}
              </dd>
            </div>
          </dl>
          <Button disabled={!ready} onClick={onLibrary} type="button" variant="outline">
            <FolderOpenIcon aria-hidden data-icon="inline-start" />
            选择目录
          </Button>
        </div>
      </section>
      <section aria-labelledby="settings-runtime-title" className="flex flex-col gap-5">
        <h2 className="text-base font-medium" id="settings-runtime-title">
          运行环境
        </h2>
        {runtime?.state === 'error' ? (
          <QueryFeedback
            compact
            error={new Error(runtime.message ?? '本地引擎未能启动，请重新检查运行环境。')}
            onRetry={onRefresh}
            title="本地引擎暂时不可用"
          />
        ) : null}
        <Table className="table-borderless">
          <TableCaption className="sr-only">本机运行环境</TableCaption>
          <TableBody>
            <TableRow>
              <TableCell className="whitespace-normal font-medium">本地引擎</TableCell>
              <TableCell className="whitespace-normal text-right">
                {runtime ? runtimeLabels[runtime.state] : '正在读取…'}
              </TableCell>
            </TableRow>
            {resources ? (
              [
                { label: '媒体处理工具', available: resources.ffmpeg },
                { label: '媒体元数据工具', available: resources.ffprobe },
                { label: '视频解析器', available: resources.yt_dlp },
              ].map((resource) => (
                <TableRow key={resource.label}>
                  <TableCell className="whitespace-normal font-medium">{resource.label}</TableCell>
                  <TableCell className="whitespace-normal text-right">
                    {resource.available ? '可用' : '未就绪'}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell className="whitespace-normal font-medium">媒体工具</TableCell>
                <TableCell className="whitespace-normal text-right">正在确认…</TableCell>
              </TableRow>
            )}
            <TableRow>
              <TableCell className="whitespace-normal font-medium">应用版本</TableCell>
              <TableCell className="whitespace-normal text-right">
                {settings?.app_version ?? '正在读取…'}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </section>
    </>
  );
}
