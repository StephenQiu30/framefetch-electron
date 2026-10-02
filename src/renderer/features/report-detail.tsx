import { ArrowLeft, ArrowSquareOut, DownloadSimple } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Report } from '../../shared/generated';
import { Button } from '../components/ui';
import { errorMessage } from '../lib/format';

export function ReportDetail({
  report,
  onBack,
  onError,
}: {
  report: Report;
  onBack(): void;
  onError(message: string): void;
}) {
  const fullReport = useQuery({
    queryKey: ['report', report.id],
    queryFn: () => window.desktop.getReport(report.id),
  });
  const exportFile = async (format: 'md' | 'docx') => {
    try {
      await window.desktop.exportReport(report.id, format);
    } catch (e) {
      onError(errorMessage(e));
    }
  };
  return (
    <>
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft size={17} />
        返回
      </Button>
      <header className="asset-header">
        <div>
          <span className="eyebrow">本地分析报告</span>
          <h1>{report.title}</h1>
          <p className="muted">
            {report.provider_label} · {report.model}
          </p>
        </div>
        <div className="inline-actions">
          <Button variant="secondary" onClick={() => exportFile('md')}>
            <DownloadSimple size={18} />
            Markdown
          </Button>
          <Button variant="secondary" onClick={() => exportFile('docx')}>
            <ArrowSquareOut size={18} />
            DOCX
          </Button>
        </div>
      </header>
      {fullReport.isPending ? (
        <p className="muted">正在读取报告…</p>
      ) : fullReport.isError ? (
        <p role="alert">{errorMessage(fullReport.error)}</p>
      ) : (
        <article className="report-prose">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            skipHtml
            components={{ a: ({ children }) => <span>{children}</span>, img: () => null }}
          >
            {fullReport.data.markdown}
          </ReactMarkdown>
        </article>
      )}
    </>
  );
}
