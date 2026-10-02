import { ArrowSquareOut, FileText, FolderOpen, Sparkle } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { Skill } from '../../shared/api';
import type { Asset, Provider, Report } from '../../shared/generated';
import {
  Button,
  EmptyState,
  Field,
  PageHeader,
  PageNavigation,
  Pagination,
  QueryFeedback,
  SelectControl,
} from '../components/ui';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { usePagedList } from '../hooks/use-paged-list';
import {
  availabilityLabel,
  bytes,
  dateTime,
  duration,
  errorMessage,
  importModeLabel,
  localizedError,
  skillLabel,
} from '../lib/format';

const videoSkills: Skill[] = ['comprehensive', 'visual-shots', 'highlights', 'video-to-article'];

export function AssetDetail({
  asset,
  providers,
  reports = [],
  onBack,
  onAnalyze,
  onError,
  onReport,
  onConfigure,
  onImport,
}: {
  asset: Asset;
  providers: Provider[];
  reports?: Report[];
  onBack(): void;
  onAnalyze(providerId: string, skill: Skill): Promise<void>;
  onError(message: string): void;
  onReport?(report: Report): void;
  onConfigure?(): void;
  onImport?(): void;
}) {
  const [providerId, setProviderId] = useState(providers[0]?.id ?? '');
  const [skill, setSkill] = useState<Skill>(
    asset.kind === 'video' ? 'comprehensive' : 'screenplay-analysis',
  );
  const [busy, setBusy] = useState(false);
  const [playbackError, setPlaybackError] = useState<Error | null>(null);
  const [playbackAttempt, setPlaybackAttempt] = useState(0);
  const available = asset.availability === 'available';
  const media = useQuery({
    queryKey: ['media', asset.id],
    queryFn: () => window.desktop.mediaUrl(asset.id, 'original'),
    enabled: asset.kind === 'video' && available,
    retry: false,
  });
  const text = useQuery({
    queryKey: ['document-text', asset.id],
    queryFn: () => window.desktop.getDocumentText(asset.id),
    enabled: asset.kind === 'document' && available,
    retry: false,
  });
  const effectiveProviderId = providerId || providers[0]?.id || '';
  const selectedProvider = providers.find((provider) => provider.id === effectiveProviderId);
  const canAnalyze =
    available && !!selectedProvider?.key_set && (asset.kind !== 'video' || selectedProvider.vision);
  const assetReports = reports.filter((report) => report.asset_id === asset.id);
  const pagination = usePagedList(assetReports);
  const action = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (error) {
      onError(errorMessage(error));
    }
  };
  const metadata = [
    ['文件大小', bytes(asset.size_bytes)],
    ['创建时间', dateTime(asset.created_at)],
    ['存储方式', importModeLabel(asset.mode)],
    ['文件状态', availabilityLabel(asset.availability)],
    ...(asset.kind === 'video'
      ? [
          ['视频时长', duration(asset.duration_seconds)],
          ['分辨率', asset.width && asset.height ? `${asset.width} × ${asset.height}` : '未提供'],
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <PageNavigation
          onBack={onBack}
          label={asset.kind === 'video' ? '返回文件管理' : '返回剧本文档'}
        />
        <PageHeader
          title={asset.title}
          description={asset.kind === 'video' ? '本地视频' : '剧本文档'}
          action={
            <div className="inline-actions">
              <Button
                type="button"
                variant="outline"
                disabled={!available}
                onClick={() => action(() => window.desktop.revealAsset(asset.id))}
              >
                <FolderOpen aria-hidden data-icon="inline-start" />
                显示文件
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!available}
                onClick={() => action(() => window.desktop.openAsset(asset.id))}
              >
                <ArrowSquareOut aria-hidden data-icon="inline-start" />
                系统打开
              </Button>
            </div>
          }
        />
      </div>
      {!available && (
        <div className="flex flex-col gap-4">
          <QueryFeedback
            error={
              new Error(
                asset.availability === 'missing'
                  ? localizedError('asset_missing')
                  : asset.availability === 'changed'
                    ? localizedError('asset_changed')
                    : '素材文件状态尚未确认，请刷新或重新导入后使用。',
              )
            }
            title="素材文件暂不可用"
            compact
          />
          {onImport && (
            <Button type="button" variant="outline" className="self-start" onClick={onImport}>
              重新导入文件
            </Button>
          )}
        </div>
      )}
      <div className="asset-detail-grid">
        <section className="min-w-0" aria-label={asset.kind === 'video' ? '视频预览' : '文档预览'}>
          {available &&
            (asset.kind === 'video' ? (
              <>
                <div className="video-container">
                  {media.data ? (
                    // biome-ignore lint/a11y/useMediaCaption: User imported media has no caption file; do not invent captions.
                    <video
                      key={`${asset.id}:${playbackAttempt}`}
                      src={media.data}
                      controls
                      preload="metadata"
                      aria-label={asset.title}
                      onError={() =>
                        setPlaybackError(
                          new Error('此文件未能在内置播放器中打开，可以使用系统播放器。'),
                        )
                      }
                    />
                  ) : media.isError ? (
                    <QueryFeedback
                      error={media.error}
                      title="暂时无法读取视频"
                      onRetry={() => void media.refetch()}
                      compact
                    />
                  ) : (
                    <p role="status">正在读取本地视频…</p>
                  )}
                </div>
                {playbackError && (
                  <QueryFeedback
                    error={playbackError}
                    title="视频预览暂不可用"
                    onRetry={() => {
                      setPlaybackError(null);
                      setPlaybackAttempt((attempt) => attempt + 1);
                      void media.refetch();
                    }}
                    compact
                  />
                )}
              </>
            ) : (
              <div className="document-preview">
                <div className="section-heading">
                  <FileText aria-hidden size={20} />
                  <h2>文档正文</h2>
                </div>
                {text.isError ? (
                  <QueryFeedback
                    error={text.error}
                    title="暂时无法读取文档"
                    onRetry={() => void text.refetch()}
                    compact
                  />
                ) : text.isPending ? (
                  <p role="status">正在读取剧本文本…</p>
                ) : (
                  <pre>{text.data}</pre>
                )}
              </div>
            ))}
          <section className="mt-8 py-5" aria-label="素材信息">
            <h2 className="text-lg font-medium tracking-tight">
              {asset.kind === 'video' ? '媒体信息' : '文档信息'}
            </h2>
            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 text-sm sm:grid-cols-3">
              {metadata.map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="font-medium">{label}</dt>
                  <dd className="mt-1 break-words text-muted-foreground tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="asset-fingerprint">
              <span>SHA-256</span>
              <code>{asset.sha256}</code>
            </p>
          </section>
        </section>
        <aside className="analysis-panel" aria-label="分析设置">
          <h2 className="text-base font-medium">
            {asset.kind === 'video' ? 'AI 视频分析' : '剧本分析'}
          </h2>
          <p className="muted">
            {asset.kind === 'video'
              ? '当前分析使用最多 12 张抽帧，不包含音频转写。抽帧会发送到你选择的 AI 服务，结果保存在本机。'
              : '提取的剧本文本会发送到你选择的 AI 服务，结果保存在本机。'}
          </p>
          {providers.length ? (
            <>
              <Field label="AI 服务">
                <SelectControl
                  value={effectiveProviderId}
                  onValueChange={setProviderId}
                  disabled={busy}
                  options={providers.map((provider) => ({
                    value: provider.id,
                    label: `${provider.label} · ${provider.model}`,
                  }))}
                />
              </Field>
              <Field label={asset.kind === 'video' ? '分析 Skill' : '剧本 Skill'}>
                <SelectControl
                  value={skill}
                  onValueChange={(value) => setSkill(value as Skill)}
                  disabled={busy}
                  options={(asset.kind === 'video'
                    ? videoSkills
                    : (['screenplay-analysis'] as Skill[])
                  ).map((value) => ({ value, label: skillLabel(value) }))}
                />
              </Field>
              {selectedProvider && !selectedProvider.key_set && (
                <p className="field-error">请先为这个 AI 服务保存 API Key。</p>
              )}
              {asset.kind === 'video' && selectedProvider && !selectedProvider.vision && (
                <p className="field-error">视频分析需要支持图像输入的模型。</p>
              )}
              <Button
                type="button"
                disabled={!canAnalyze || busy}
                className="full-width"
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onAnalyze(effectiveProviderId, skill);
                  } catch (error) {
                    onError(errorMessage(error));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Sparkle aria-hidden data-icon="inline-start" />
                {busy ? '正在创建任务…' : '开始分析'}
              </Button>
            </>
          ) : (
            <EmptyState
              icon={<Sparkle aria-hidden size={24} />}
              title="还没有 AI 服务配置"
              description="新增自己的 AI 服务后即可开始分析。媒体播放无需模型配置。"
              action={
                onConfigure && (
                  <Button type="button" variant="outline" onClick={onConfigure}>
                    配置 AI 服务
                  </Button>
                )
              }
            />
          )}
          {providers.length > 0 && onConfigure && (
            <Button type="button" variant="ghost" className="mt-3" onClick={onConfigure}>
              管理 AI 服务
            </Button>
          )}
        </aside>
      </div>
      <section className="flex flex-col gap-6" aria-label="分析报告">
        <h2 className="text-xl font-medium tracking-tight">分析报告</h2>
        {assetReports.length ? (
          <>
            <Table className="table-borderless">
              <TableHeader>
                <TableRow>
                  <TableHead>报告</TableHead>
                  <TableHead className="hidden md:table-cell">AI 服务与模型</TableHead>
                  <TableHead className="hidden lg:table-cell">生成时间</TableHead>
                  {onReport && <TableHead className="text-right">操作</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.items.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell className="whitespace-normal">
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="font-medium break-words">{report.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {skillLabel(report.skill)}
                        </span>
                        <p className="line-clamp-2 text-xs text-muted-foreground">
                          {report.summary}
                        </p>
                        <span className="text-xs text-muted-foreground md:hidden">
                          {report.provider_label} · {report.model}
                        </span>
                        <span className="text-xs text-muted-foreground lg:hidden">
                          {dateTime(report.created_at)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell whitespace-normal">
                      <div className="flex flex-col gap-1">
                        <span>{report.provider_label}</span>
                        <span className="text-xs text-muted-foreground break-all">
                          {report.model}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                      <time dateTime={report.created_at}>{dateTime(report.created_at)}</time>
                    </TableCell>
                    {onReport && (
                      <TableCell className="text-right">
                        <Button type="button" variant="ghost" onClick={() => onReport(report)}>
                          查看报告
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination {...pagination} ariaLabel="素材分析报告分页" />
          </>
        ) : (
          <EmptyState
            icon={<FileText aria-hidden size={24} />}
            title="还没有分析报告"
            description="完成分析后，可在这里查看结果并导出 Markdown 或 DOCX。"
          />
        )}
      </section>
    </div>
  );
}
