import {
  ArrowRight,
  Cloud,
  PencilSimple,
  Robot,
  TerminalWindow,
  Trash,
} from '@phosphor-icons/react';
import {
  type BulkDeleteOptions,
  BulkDeleteSelection,
} from '@/components/layout/bulk-delete-selection';
import { type DataColumn, DataTable } from '@/components/layout/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import { providerApiBaseUrl, providerEngineLabel } from './model';

export function ExecutionRoute({
  active,
  fallback,
}: {
  active: API.AiProviderProfileResponse;
  fallback?: API.AiProviderProfileResponse;
}) {
  return (
    <div className="mt-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <RouteNode icon={<Robot />} label="容器 Worker (analysis-worker)" />
        <ArrowRight aria-hidden />
        <RouteNode
          icon={<TerminalWindow />}
          label={providerEngineLabel(active.engine)}
        />
        <ArrowRight aria-hidden />
        <RouteNode
          icon={<Cloud />}
          label={active.base_url || providerApiBaseUrl(active.engine)}
        />
      </div>
      {fallback ? (
        <ItemDescription className="line-clamp-none break-all">
          自动切换备用：{fallback.display_name}（
          {providerEngineLabel(fallback.engine)} · {fallback.model}）
        </ItemDescription>
      ) : null}
    </div>
  );
}

function ProviderRowColumns(
  onActivate: (item: API.AiProviderProfileResponse) => void,
  onDelete: (item: API.AiProviderProfileResponse) => void,
  onEdit: (item: API.AiProviderProfileResponse) => void,
  onSetFallback?: (item: API.AiProviderProfileResponse) => void,
  onClearFallback?: (item: API.AiProviderProfileResponse) => void,
): DataColumn<API.AiProviderProfileResponse>[] {
  return [
    {
      id: '服务',
      header: '服务',
      hideable: false,
      className: 'w-full whitespace-normal [overflow-wrap:anywhere] lg:w-1/3',
      cell: (item) => {
        return (
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <ItemTitle className="line-clamp-none">
                <h3>{item.display_name}</h3>
              </ItemTitle>
              {item.is_active ? (
                <Badge variant="default">当前线路</Badge>
              ) : null}
              {item.is_fallback ? (
                <Badge variant="secondary">备用兜底</Badge>
              ) : null}
            </div>
            <ItemDescription className="line-clamp-none break-all">
              {item.key}
            </ItemDescription>
            <ItemDescription className="line-clamp-none break-all lg:hidden">
              {providerEngineLabel(item.engine)} · {item.model} ·{' '}
              {item.supports_vision ? '多模态' : '纯文本'} ·{' '}
              {connectionLabel(item)}
            </ItemDescription>
          </div>
        );
      },
    },
    {
      id: '模型与连接',
      header: '模型与连接',
      className:
        'hidden whitespace-normal [overflow-wrap:anywhere] lg:table-cell lg:w-1/3',
      cell: (item) => {
        return (
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="break-all">{item.model}</span>
              <Badge variant={item.supports_vision ? 'secondary' : 'outline'}>
                {item.supports_vision ? '多模态' : '纯文本'}
              </Badge>
            </div>
            <ItemDescription className="line-clamp-none break-all">
              {connectionLabel(item)}
            </ItemDescription>
          </div>
        );
      },
    },
    {
      id: '官方渠道',
      header: '官方渠道',
      className: 'hidden whitespace-nowrap lg:table-cell',
      cell: (item) => {
        return (
          <Badge variant="secondary">{providerEngineLabel(item.engine)}</Badge>
        );
      },
    },
    {
      id: '操作',
      header: '操作',
      hideable: false,
      className: 'text-right whitespace-nowrap',
      cell: (item) => {
        const lockedDelete = item.is_active || item.is_fallback;
        return (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!item.is_active ? (
              <Button
                onClick={() => onActivate(item)}
                size="default"
                variant="outline"
              >
                启用
              </Button>
            ) : null}
            {!item.is_active && item.is_fallback && onClearFallback ? (
              <Button
                onClick={() => onClearFallback(item)}
                size="default"
                variant="ghost"
              >
                取消备用
              </Button>
            ) : null}
            {!item.is_active && !item.is_fallback && onSetFallback ? (
              <Button
                onClick={() => onSetFallback(item)}
                size="default"
                variant="ghost"
              >
                设为备用
              </Button>
            ) : null}
            <Button
              aria-label={`编辑 ${item.display_name}`}
              onClick={() => onEdit(item)}
              size="icon"
              variant="ghost"
            >
              <PencilSimple aria-hidden />
            </Button>
            <Button
              aria-label={`删除 ${item.display_name}`}
              disabled={lockedDelete}
              onClick={() => onDelete(item)}
              size="icon"
              title={
                item.is_active
                  ? '当前启用的线路不可删除'
                  : item.is_fallback
                    ? '备用兜底线路请先取消备用后再删除'
                    : undefined
              }
              variant="ghost"
            >
              <Trash aria-hidden />
            </Button>
          </div>
        );
      },
    },
  ];
}

function connectionLabel(item: API.AiProviderProfileResponse) {
  return `${item.base_url || providerApiBaseUrl(item.engine)} · ${item.credential_configured ? '凭据已配置' : '缺少凭据'}`;
}

export function ProviderTable({
  bulk,
  items,
  onActivate,
  onClearFallback,
  onDelete,
  onEdit,
  onSetFallback,
}: {
  bulk?: BulkDeleteOptions;
  items: API.AiProviderProfileResponse[];
  onActivate: (item: API.AiProviderProfileResponse) => void;
  onClearFallback?: (item: API.AiProviderProfileResponse) => void;
  onDelete: (item: API.AiProviderProfileResponse) => void;
  onEdit: (item: API.AiProviderProfileResponse) => void;
  onSetFallback?: (item: API.AiProviderProfileResponse) => void;
}) {
  return (
    <BulkDeleteSelection
      ids={items
        .filter((item) => !item.is_active && !item.is_fallback)
        .map((item) => item.key)}
      options={bulk}
    >
      <DataTable<API.AiProviderProfileResponse>
        data={items}
        getRowId={(item) => item.key}
        getRowLabel={(item) => item.display_name}
        caption="AI Provider 配置列表"
        columns={ProviderRowColumns(
          onActivate,
          onDelete,
          onEdit,
          onSetFallback,
          onClearFallback,
        )}
      />
    </BulkDeleteSelection>
  );
}

function RouteNode({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <Item className="min-w-0 w-auto flex-nowrap" size="xs" variant="muted">
      <ItemMedia aria-hidden variant="icon">
        {icon}
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="break-all">{label}</ItemTitle>
      </ItemContent>
    </Item>
  );
}
