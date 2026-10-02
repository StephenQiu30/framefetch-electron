import { ClockCounterClockwiseIcon, FolderOpenIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import type { Asset, Report, Task } from '../../shared/generated';
import { Button, EmptyState, PageHeader, Pagination, QueryFeedback } from '../components/ui';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { Skeleton } from '../components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { usePagedList } from '../hooks/use-paged-list';
import { dateTime, isActive, taskError, taskKind, taskStage, taskStatus } from '../lib/format';

export function TasksView({
  tasks,
  assets,
  reports,
  pending,
  error,
  tab,
  onTabChange,
  onRefresh,
  onCancel,
  onRetry,
  onSelect,
  onReports,
}: {
  tasks: Task[];
  assets: Asset[];
  reports: Report[];
  pending: boolean;
  error: unknown;
  tab: string;
  onTabChange(tab: string): void;
  onRefresh(): void;
  onCancel(id: string): Promise<void>;
  onRetry(task: Task): void;
  onSelect(asset: Asset): void;
  onReports(asset: Asset): void;
}) {
  const [cancelling, setCancelling] = useState<string | null>(null);
  const filtered = tasks.filter((task) =>
    tab === 'import'
      ? task.kind.startsWith('import_')
      : tab === 'export'
        ? task.kind === 'export_report'
        : task.kind === tab,
  );
  const pagination = usePagedList(filtered);
  return (
    <>
      <PageHeader
        title="下载记录"
        description="继续查看、获取或分析已创建的任务。"
        action={
          <Button variant="outline" onClick={onRefresh}>
            刷新
          </Button>
        }
      />
      <Tabs
        value={tab}
        onValueChange={(value) => {
          pagination.reset();
          onTabChange(value);
        }}
      >
        <TabsList aria-label="记录类型">
          <TabsTrigger value="download">下载记录</TabsTrigger>
          <TabsTrigger value="import">导入记录</TabsTrigger>
          <TabsTrigger value="analysis">分析任务</TabsTrigger>
          <TabsTrigger value="export">报告导出</TabsTrigger>
        </TabsList>
      </Tabs>
      {pending && !tasks.length ? (
        <Skeleton aria-label="正在读取记录" className="h-32 w-full" />
      ) : error && !tasks.length ? (
        <QueryFeedback error={error} onRetry={onRefresh} />
      ) : (
        <>
          {error && <QueryFeedback error={error} onRetry={onRefresh} compact />}
          {!filtered.length ? (
            <EmptyState
              icon={<ClockCounterClockwiseIcon />}
              title={
                tab === 'download'
                  ? '暂无下载记录'
                  : tab === 'analysis'
                    ? '暂无分析任务'
                    : tab === 'export'
                      ? '暂无报告导出记录'
                      : '暂无导入记录'
              }
              description="从首页选择内容来源。任务进度和结果会保存在本机。"
            />
          ) : (
            <>
              <Table className="table-borderless">
                <TableHeader>
                  <TableRow>
                    <TableHead>内容</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="hidden md:table-cell">时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.items.map((task) => {
                    const asset = assets.find((item) => item.id === task.asset_id);
                    const hasReports = reports.some((report) => report.asset_id === task.asset_id);
                    const percentage =
                      task.progress == null
                        ? null
                        : Math.max(
                            0,
                            Math.min(
                              100,
                              Math.round(task.progress <= 1 ? task.progress * 100 : task.progress),
                            ),
                          );
                    return (
                      <TableRow key={task.id}>
                        <TableCell className="whitespace-normal">
                          <div className="flex flex-col gap-1">
                            <span className="font-medium break-words">
                              {asset?.title ?? taskKind(task)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {taskKind(task)} · {taskStage(task)}
                            </span>
                            {taskError(task) && (
                              <span className="text-xs text-destructive">{taskError(task)}</span>
                            )}
                            <span className="text-xs text-muted-foreground md:hidden">
                              {dateTime(task.created_at)}
                            </span>
                            {task.status === 'needs_attention' && (
                              <span className="text-xs text-muted-foreground">
                                服务调用结果未知。请先核对服务记录，再决定是否重新分析；再次调用可能产生费用。
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-2">
                            <Badge
                              variant={
                                task.status === 'failed' || task.status === 'needs_attention'
                                  ? 'destructive'
                                  : 'secondary'
                              }
                            >
                              {taskStatus(task)}
                            </Badge>
                            {isActive(task) && percentage != null && (
                              <>
                                <Progress value={percentage} aria-label="任务进度" />
                                <span className="text-xs text-muted-foreground tabular-nums">
                                  {percentage}%
                                </span>
                              </>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                            <span>创建 {dateTime(task.created_at)}</span>
                            <span>更新 {dateTime(task.updated_at)}</span>
                            {(task.attempt ?? 0) > 1 && <span>第 {task.attempt} 次执行</span>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap justify-end gap-2">
                            {isActive(task) && (
                              <Button
                                variant="ghost"
                                disabled={task.status === 'cancelling' || cancelling === task.id}
                                onClick={async () => {
                                  setCancelling(task.id);
                                  try {
                                    await onCancel(task.id);
                                  } finally {
                                    setCancelling(null);
                                  }
                                }}
                              >
                                取消
                              </Button>
                            )}
                            {['failed', 'interrupted', 'cancelled', 'needs_attention'].includes(
                              task.status,
                            ) && (
                              <Button variant="outline" onClick={() => onRetry(task)}>
                                {task.kind === 'analysis' ? '重新分析' : '重试'}
                              </Button>
                            )}
                            {asset && task.status === 'succeeded' && (
                              <Button variant="ghost" onClick={() => onSelect(asset)}>
                                <FolderOpenIcon data-icon="inline-start" />
                                查看{asset.kind === 'document' ? '文档' : '视频'}
                              </Button>
                            )}
                            {asset && hasReports && task.kind === 'analysis' && (
                              <Button variant="ghost" onClick={() => onReports(asset)}>
                                查看素材与报告
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <Pagination {...pagination} ariaLabel="记录分页" />
            </>
          )}
        </>
      )}
    </>
  );
}
