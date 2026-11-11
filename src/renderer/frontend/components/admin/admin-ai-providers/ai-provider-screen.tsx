import { ArrowClockwise, CheckCircle } from '@phosphor-icons/react';
import { FeedbackNotice } from '@/components/layout/feedback-notice';
import { PageErrorNotice } from '@/components/layout/page-error-notice';
import { PageHeader } from '@/components/layout/page-header';
import { PageNavigation } from '@/components/layout/page-navigation';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Item, ItemContent, ItemDescription } from '@/components/ui/item';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';

import { AiServiceConfigurator } from './ai-service-configurator';
import { AiServiceSelector } from './ai-service-selector';
import type { AiServiceDraft } from './model';

type AiProviderScreenProps = {
  activating: boolean;
  agentAvailable: boolean;
  clearTarget: API.AiProviderProfileResponse | null;
  clearing: boolean;
  draft: AiServiceDraft | null;
  error: string;
  items: API.AiProviderProfileResponse[];
  loading: boolean;
  selectedEngine: API.AiProviderEngine;
  onActivate: (service: API.AiProviderProfileResponse) => void;
  onClearCancel: () => void;
  onClearConfirm: () => void;
  onClearRequest: (service: API.AiProviderProfileResponse) => void;
  onDraftChange: (patch: Partial<AiServiceDraft>) => void;
  onRetry: () => void;
  onSave: () => void;
  onSelect: (service: API.AiProviderProfileResponse) => void;
  onTest: () => void;
};

export function AiProviderScreen({
  activating,
  agentAvailable,
  clearTarget,
  clearing,
  draft,
  error,
  items,
  loading,
  selectedEngine,
  onActivate,
  onClearCancel,
  onClearConfirm,
  onClearRequest,
  onDraftChange,
  onRetry,
  onSave,
  onSelect,
  onTest,
}: AiProviderScreenProps) {
  const active = items.find((item) => item.is_active);
  const selectedService =
    items.find((item) => item.engine === selectedEngine) ?? items[0];

  return (
    <div aria-busy={loading} className="flex flex-col gap-6">
      <div>
        <PageNavigation fallbackHref="/" />
        <PageHeader
          description="选择官方 AI 服务并填入 API Key，保存后即用于后续视频与文档分析。"
          title="AI 服务"
        />
      </div>

      {!loading && error && items.length === 0 ? (
        <PageErrorNotice
          message={error}
          onRetry={onRetry}
          retryLabel="重新加载"
          title="暂时无法读取 AI 服务配置"
        />
      ) : null}

      {!loading && error && items.length > 0 ? (
        <FeedbackNotice
          action={
            <Button onClick={onRetry} size="default" variant="secondary">
              <ArrowClockwise aria-hidden data-icon="inline-start" />
              重新加载
            </Button>
          }
          description={error}
          title="数据刷新失败"
          tone="error"
        />
      ) : null}

      {!agentAvailable && !loading && !error ? (
        <FeedbackNotice
          description="分析 Worker 暂未就绪，您仍可先保存并测试 API Key，Worker 恢复后自动生效。"
          title="Worker 离线"
          tone="info"
        />
      ) : null}

      {loading ? (
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      ) : items.length > 0 ? (
        <>
          <Item variant="muted">
            <ItemContent>
              <ItemDescription className="line-clamp-none flex flex-wrap items-center gap-2 text-foreground">
                {agentAvailable ? (
                  <Badge variant="default">Worker 在线</Badge>
                ) : null}
                {active ? (
                  <span className="inline-flex items-center gap-1.5 text-sm">
                    <CheckCircle aria-hidden className="size-4" weight="fill" />
                    当前使用：{active.display_name}（{active.model}）
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    尚未启用任何 AI 服务，请在下方填入 API Key 并保存启用。
                  </span>
                )}
              </ItemDescription>
            </ItemContent>
          </Item>

          <AiServiceSelector
            busy={activating || clearing || Boolean(draft?.saving)}
            items={items}
            onActivate={onActivate}
            onSelect={onSelect}
            selectedEngine={selectedService.engine}
          />

          {selectedService && draft ? (
            <AiServiceConfigurator
              draft={draft}
              onChange={onDraftChange}
              onClearRequest={onClearRequest}
              onSave={onSave}
              onTest={onTest}
              service={selectedService}
            />
          ) : null}
        </>
      ) : null}

      <AlertDialog
        onOpenChange={(open) => {
          if (!open && !clearing) onClearCancel();
        }}
        open={clearTarget !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              清除 {clearTarget?.display_name} 的配置？
            </AlertDialogTitle>
            <AlertDialogDescription>
              将清除已加密存储的 API Key
              与当前模型偏好。若该服务当前处于启用状态，清除后需启用其他服务方可继续执行分析。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearing}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={clearing}
              onClick={onClearConfirm}
              variant="destructive"
            >
              {clearing ? (
                <Spinner aria-hidden data-icon="inline-start" />
              ) : null}
              {clearing ? '正在清除' : '确认清除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
