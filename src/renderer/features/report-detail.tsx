import { DownloadSimple, SpinnerGap } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import type { Report } from '../../shared/generated';
import { Button, PageHeader, PageNavigation, QueryFeedback } from '../components/ui';
import { dateTime, errorMessage, skillLabel } from '../lib/format';

const allowedElements = [
  'blockquote',
  'code',
  'em',
  'h1',
  'h2',
  'h3',
  'hr',
  'li',
  'ol',
  'p',
  'strong',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'ul',
];

export function ReportDetail({
  report,
  onBack,
  onError,
}: {
  report: Report;
  onBack(): void;
  onError(message: string): void;
}) {
  const [exporting, setExporting] = useState<'md' | 'docx' | null>(null);
  const fullReport = useQuery({
    queryKey: ['report', report.id],
    queryFn: () => window.desktop.getReport(report.id),
    retry: false,
  });
  const current = fullReport.data ?? report;
  const exportFile = async (format: 'md' | 'docx') => {
    setExporting(format);
    try {
      const exported = await window.desktop.exportReport(report.id, format);
      if (exported) toast.success('报告已导出到你选择的位置。');
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setExporting(null);
    }
  };
  return (
    <div className="flex flex-col gap-8">
      <div>
        <PageNavigation onBack={onBack} label="返回分析报告" />
        <PageHeader
          title={current.title}
          description="分析详情"
          action={
            <div className="inline-actions">
              {(['md', 'docx'] as const).map((format) => (
                <Button
                  type="button"
                  variant="outline"
                  disabled={!!exporting || !fullReport.data}
                  key={format}
                  onClick={() => void exportFile(format)}
                >
                  {exporting === format ? (
                    <SpinnerGap aria-hidden data-icon="inline-start" className="animate-spin" />
                  ) : (
                    <DownloadSimple aria-hidden data-icon="inline-start" />
                  )}
                  {exporting === format
                    ? '正在导出…'
                    : `导出 ${format === 'md' ? 'Markdown' : 'DOCX'}`}
                </Button>
              ))}
            </div>
          }
        />
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 text-sm sm:grid-cols-4">
        <div>
          <dt className="font-medium">分析 Skill</dt>
          <dd className="mt-1 text-muted-foreground">{skillLabel(current.skill)}</dd>
        </div>
        <div>
          <dt className="font-medium">AI 服务</dt>
          <dd className="mt-1 break-words text-muted-foreground">{current.provider_label}</dd>
        </div>
        <div>
          <dt className="font-medium">模型</dt>
          <dd className="mt-1 break-all text-muted-foreground">{current.model}</dd>
        </div>
        <div>
          <dt className="font-medium">生成时间</dt>
          <dd className="mt-1 text-muted-foreground tabular-nums">
            <time dateTime={current.created_at}>{dateTime(current.created_at)}</time>
          </dd>
        </div>
      </dl>
      {fullReport.isPending ? (
        <p className="muted py-12" role="status">
          正在读取分析报告…
        </p>
      ) : fullReport.isError && !fullReport.data ? (
        <QueryFeedback
          error={fullReport.error}
          title="暂时无法读取分析报告"
          onRetry={() => void fullReport.refetch()}
        />
      ) : (
        <>
          {fullReport.isError && (
            <QueryFeedback
              error={fullReport.error}
              title="报告刷新未完成"
              onRetry={() => void fullReport.refetch()}
              compact
            />
          )}
          <section aria-label="分析摘要">
            <h2 className="text-xl font-medium tracking-tight">摘要</h2>
            <p className="mt-3 whitespace-pre-line text-base leading-8 text-muted-foreground">
              {current.summary}
            </p>
          </section>
          <section className="flex flex-col gap-5" aria-label="报告预览">
            <h2 className="text-xl font-medium tracking-tight">报告预览</h2>
            <article className="report-prose" aria-label="Markdown 分析报告预览">
              <ReactMarkdown
                allowedElements={allowedElements}
                remarkPlugins={[remarkGfm]}
                skipHtml
                unwrapDisallowed
                urlTransform={() => ''}
                components={{
                  h1: ({ children }) => <h3>{children}</h3>,
                  h2: ({ children }) => <h4>{children}</h4>,
                  h3: ({ children }) => <h5>{children}</h5>,
                }}
              >
                {current.markdown}
              </ReactMarkdown>
            </article>
          </section>
          <p className="asset-fingerprint">
            <span>源素材 SHA-256</span>
            <code>{current.source_sha256}</code>
          </p>
        </>
      )}
    </div>
  );
}
