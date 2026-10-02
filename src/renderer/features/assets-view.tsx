import { FileTextIcon, FileVideoIcon, MagnifyingGlassIcon, PlusIcon } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { Asset, Report } from '../../shared/generated';
import { Button, EmptyState, Input, PageHeader, Pagination, QueryFeedback } from '../components/ui';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
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
  importModeLabel,
  skillLabel,
} from '../lib/format';

function MediaCover({ asset }: { asset: Asset }) {
  const thumbnail = useQuery({
    queryKey: ['thumbnail', asset.id],
    queryFn: () => window.desktop.mediaUrl(asset.id, 'thumbnail'),
    retry: false,
    enabled: asset.kind === 'video',
  });
  const [failed, setFailed] = useState(false);
  return (
    <div className="thumbnail relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
      {thumbnail.data && !failed ? (
        <img
          src={thumbnail.data}
          alt=""
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex size-full items-center justify-center text-muted-foreground">
          <FileVideoIcon size={24} />
        </div>
      )}
      <span className="absolute right-1 bottom-1 rounded bg-background/90 px-1 text-xs tabular-nums">
        {duration(asset.duration_seconds)}
      </span>
    </div>
  );
}
export function AssetsView({
  kind,
  assets,
  reports,
  pending,
  error,
  ready,
  onRefresh,
  onSelect,
  onImport,
}: {
  kind: 'video' | 'document';
  assets: Asset[];
  reports: Report[];
  pending: boolean;
  error: unknown;
  ready: boolean;
  onRefresh(): void;
  onSelect(asset: Asset): void;
  onImport(): void;
}) {
  const [search, setSearch] = useState('');
  const filtered = assets.filter((asset) =>
    asset.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  const pagination = usePagedList(filtered);
  const document = kind === 'document';
  return (
    <>
      <PageHeader
        title={document ? '剧本文档' : '文件管理'}
        description={
          document
            ? '核对导入状态、提取文本和规范化剧本文本。'
            : '查看本机保存的视频文件、媒体信息和关联分析报告。'
        }
        action={
          <Button disabled={!ready} onClick={onImport}>
            <PlusIcon data-icon="inline-start" />
            {document ? '导入文档' : '导入视频'}
          </Button>
        }
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          aria-label={document ? '搜索剧本文档' : '搜索文件'}
          placeholder={document ? '搜索文档名称' : '搜索文件名称'}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            pagination.reset();
          }}
          className="sm:max-w-md"
        />
        <Button variant="outline" onClick={onRefresh}>
          刷新
        </Button>
      </div>
      {pending && !assets.length ? (
        <Skeleton aria-label="正在读取文件" className="h-32 w-full" />
      ) : error && !assets.length ? (
        <QueryFeedback error={error} onRetry={onRefresh} />
      ) : (
        <>
          {error && <QueryFeedback error={error} onRetry={onRefresh} compact />}
          {!filtered.length ? (
            <EmptyState
              icon={
                search ? <MagnifyingGlassIcon /> : document ? <FileTextIcon /> : <FileVideoIcon />
              }
              title={search ? '没有匹配的内容' : document ? '还没有剧本文档' : '还没有本地视频'}
              description={
                search
                  ? '尝试其他名称或清除筛选条件。'
                  : document
                    ? '支持文本、Markdown、Fountain、文字型 PDF 和 DOCX。'
                    : '从首页解析公开视频链接，或导入本地 MP4 视频。'
              }
            />
          ) : (
            <>
              <Table className="table-borderless">
                <TableHeader>
                  <TableRow>
                    <TableHead>文件</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="hidden lg:table-cell">文件信息</TableHead>
                    <TableHead className="hidden md:table-cell">导入时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.items.map((asset) => (
                    <TableRow key={asset.id}>
                      <TableCell className="whitespace-normal">
                        <div className="flex items-center gap-4">
                          {!document && (
                            <div className="hidden w-28 shrink-0 sm:block">
                              <MediaCover asset={asset} />
                            </div>
                          )}
                          <div className="flex min-w-0 flex-col gap-1">
                            <span className="font-medium break-words">{asset.title}</span>
                            <span className="text-xs text-muted-foreground">
                              {bytes(asset.size_bytes)} · {importModeLabel(asset.mode)}
                            </span>
                            {!document && (
                              <span className="text-xs text-muted-foreground lg:hidden">
                                {duration(asset.duration_seconds)}
                                {asset.width && asset.height
                                  ? ` · ${asset.width} × ${asset.height}`
                                  : ''}
                              </span>
                            )}
                            {document && asset.text_preview && (
                              <span className="line-clamp-2 text-xs text-muted-foreground">
                                {asset.text_preview}
                              </span>
                            )}
                            {reports.some((report) => report.asset_id === asset.id) && (
                              <span className="text-xs text-muted-foreground">已有分析报告</span>
                            )}
                            <span className="text-xs text-muted-foreground md:hidden">
                              {dateTime(asset.created_at)}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            asset.availability && asset.availability !== 'available'
                              ? 'destructive'
                              : 'secondary'
                          }
                        >
                          {availabilityLabel(asset.availability)}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                          <span>{document ? '剧本文档' : duration(asset.duration_seconds)}</span>
                          {asset.width && asset.height ? (
                            <span>
                              {asset.width} × {asset.height}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                        {dateTime(asset.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          aria-label={`查看 ${asset.title}`}
                          onClick={() => onSelect(asset)}
                        >
                          查看详情
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination {...pagination} ariaLabel={document ? '剧本文档分页' : '文件分页'} />
            </>
          )}
        </>
      )}
    </>
  );
}
export function ReportsView({
  reports,
  pending,
  error,
  onRefresh,
  onSelect,
}: {
  reports: Report[];
  pending: boolean;
  error: unknown;
  onRefresh(): void;
  onSelect(report: Report): void;
}) {
  const [search, setSearch] = useState('');
  const filtered = reports.filter((report) =>
    (report.title + report.summary).toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  const pagination = usePagedList(filtered);
  return (
    <>
      <PageHeader
        title="分析报告"
        description="查看已完成的视频与剧本分析，或导出报告。已有报告可离线阅读。"
        action={
          <Button variant="outline" onClick={onRefresh}>
            刷新
          </Button>
        }
      />
      <Input
        aria-label="搜索分析报告"
        placeholder="搜索标题或摘要"
        value={search}
        className="sm:max-w-md"
        onChange={(event) => {
          setSearch(event.target.value);
          pagination.reset();
        }}
      />
      {pending && !reports.length ? (
        <Skeleton aria-label="正在读取报告" className="h-32 w-full" />
      ) : error && !reports.length ? (
        <QueryFeedback error={error} onRetry={onRefresh} />
      ) : (
        <>
          {error && <QueryFeedback error={error} onRetry={onRefresh} compact />}
          {!filtered.length ? (
            <EmptyState
              icon={<FileTextIcon />}
              title={search ? '没有匹配的报告' : '还没有分析报告'}
              description="完成视频或剧本分析后，可在这里查看报告和导出文件。"
            />
          ) : (
            <>
              <Table className="table-borderless">
                <TableHeader>
                  <TableRow>
                    <TableHead>报告</TableHead>
                    <TableHead className="hidden md:table-cell">AI 服务与模型</TableHead>
                    <TableHead className="hidden lg:table-cell">生成时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.items.map((report) => (
                    <TableRow key={report.id}>
                      <TableCell className="whitespace-normal">
                        <div className="flex flex-col gap-1">
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
                        {dateTime(report.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" onClick={() => onSelect(report)}>
                          查看报告
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination {...pagination} ariaLabel="报告分页" />
            </>
          )}
        </>
      )}
    </>
  );
}
