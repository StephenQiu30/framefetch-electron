import {
  ArrowClockwiseIcon,
  PencilSimpleIcon,
  PlusIcon,
  RobotIcon,
  SpinnerIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import { useRef, useState } from 'react';
import type { Provider } from '../../shared/generated';
import { Button, EmptyState, PageHeader, Pagination, QueryFeedback } from '../components/ui';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { usePagedList } from '../hooks/use-paged-list';

export function AiServicesView({
  providers,
  pending,
  error,
  ready,
  onAdd,
  onEdit,
  onRemove,
  onRefresh,
}: {
  providers: Provider[];
  pending: boolean;
  error: unknown;
  ready: boolean;
  onAdd(): void;
  onEdit(provider: Provider): void;
  onRemove(provider: Provider): Promise<void>;
  onRefresh(): void;
}) {
  const pagination = usePagedList(providers);
  const [remove, setRemove] = useState<Provider | null>(null);
  const [removeError, setRemoveError] = useState<unknown>(null);
  const [removing, setRemoving] = useState(false);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const addButton = useRef<HTMLButtonElement | null>(null);
  const removeProvider = async () => {
    if (!remove || removing) return;
    setRemoveError(null);
    setRemoving(true);
    try {
      await onRemove(remove);
      setRemove(null);
    } catch (reason) {
      setRemoveError(reason);
    } finally {
      setRemoving(false);
    }
  };
  return (
    <>
      <PageHeader
        title="AI 服务"
        description="管理用于视频与剧本分析的 AI 服务。"
        action={
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button disabled={!ready} onClick={onAdd} ref={addButton} type="button">
              <PlusIcon aria-hidden data-icon="inline-start" />
              新增 AI 服务
            </Button>
            <Button
              aria-busy={pending}
              disabled={pending}
              onClick={onRefresh}
              type="button"
              variant="outline"
            >
              {pending ? (
                <SpinnerIcon aria-hidden className="animate-spin" data-icon="inline-start" />
              ) : (
                <ArrowClockwiseIcon aria-hidden data-icon="inline-start" />
              )}
              {pending ? '刷新中…' : '刷新'}
            </Button>
          </div>
        }
      />
      {error ? (
        <QueryFeedback
          compact={providers.length > 0}
          error={error}
          onRetry={onRefresh}
          title={providers.length ? 'AI 服务刷新失败' : '暂时无法读取 AI 服务'}
        />
      ) : null}
      {pending && providers.length === 0 ? (
        <div aria-busy="true" className="flex flex-col gap-5">
          <span className="sr-only" role="status">
            正在加载 AI 服务
          </span>
          {['first', 'second', 'third'].map((key) => (
            <div className="flex items-center justify-between gap-5" key={key}>
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-5 w-2/5" />
                <Skeleton className="h-4 w-3/5" />
              </div>
              <Skeleton className="h-8 w-16" />
            </div>
          ))}
        </div>
      ) : providers.length ? (
        <div className="flex flex-col gap-5">
          <Table className="table-borderless">
            <TableCaption className="sr-only">AI 服务配置</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-normal">显示名称</TableHead>
                <TableHead className="hidden whitespace-normal lg:table-cell">
                  API Base URL
                </TableHead>
                <TableHead className="hidden whitespace-normal lg:table-cell">模型</TableHead>
                <TableHead className="hidden whitespace-normal lg:table-cell">能力</TableHead>
                <TableHead className="hidden whitespace-normal lg:table-cell">API Key</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagination.items.map((provider) => (
                <TableRow key={provider.id}>
                  <TableCell className="whitespace-normal">
                    <div className="flex min-w-0 flex-col gap-2">
                      <p className="font-medium">{provider.label}</p>
                      <div className="flex flex-col gap-1 text-xs text-muted-foreground lg:hidden">
                        <span className="break-all">{provider.base_url}</span>
                        <span className="break-all">{provider.model}</span>
                        <span>
                          {provider.vision ? '图像与文本' : '文本'} ·{' '}
                          {provider.key_set ? '密钥已配置' : '未配置密钥'}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden whitespace-normal lg:table-cell">
                    <span className="break-all text-muted-foreground">{provider.base_url}</span>
                  </TableCell>
                  <TableCell className="hidden whitespace-normal lg:table-cell">
                    <span className="break-all font-mono text-xs">{provider.model}</span>
                  </TableCell>
                  <TableCell className="hidden whitespace-normal lg:table-cell">
                    <Badge variant="secondary">{provider.vision ? '图像与文本' : '文本'}</Badge>
                  </TableCell>
                  <TableCell className="hidden whitespace-normal lg:table-cell">
                    <Badge variant="secondary">{provider.key_set ? '已配置' : '未配置'}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        aria-label={`编辑 ${provider.label}`}
                        disabled={!ready || removing}
                        onClick={() => onEdit(provider)}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <PencilSimpleIcon aria-hidden />
                      </Button>
                      <Button
                        aria-label={`删除 ${provider.label}`}
                        disabled={!ready || removing}
                        onClick={(event) => {
                          returnFocus.current = event.currentTarget;
                          setRemoveError(null);
                          setRemove(provider);
                        }}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <TrashIcon aria-hidden />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination
            ariaLabel="AI 服务分页"
            busy={pending}
            page={pagination.page}
            pageSize={pagination.pageSize}
            totalItems={pagination.totalItems}
            onPageChange={pagination.onPageChange}
            onPageSizeChange={pagination.onPageSizeChange}
          />
        </div>
      ) : !error ? (
        <EmptyState
          icon={<RobotIcon aria-hidden />}
          title="还没有 AI 服务配置"
          description="新增一个 AI 服务后，可在素材详情中选择模型并发起分析。"
          action={
            <Button disabled={!ready} onClick={onAdd} type="button">
              <PlusIcon aria-hidden data-icon="inline-start" />
              新增第一个 AI 服务
            </Button>
          }
        />
      ) : null}
      <AlertDialog
        open={remove !== null}
        onOpenChange={(open) => {
          if (!open && !removing) {
            setRemove(null);
            setRemoveError(null);
          }
        }}
      >
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (returnFocus.current?.isConnected) returnFocus.current.focus();
            else addButton.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>删除 AI 服务</AlertDialogTitle>
            <AlertDialogDescription>
              确认删除“{remove?.label}”的配置和本机保存的密钥？已有分析报告会保留。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <QueryFeedback compact error={removeError} title="删除未完成，请重试" />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={removing}
              onClick={(event) => {
                event.preventDefault();
                void removeProvider();
              }}
              variant="destructive"
            >
              {removing ? (
                <SpinnerIcon aria-hidden className="animate-spin" data-icon="inline-start" />
              ) : null}
              {removing ? '正在删除…' : '删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
