import {
  ArrowDownIcon,
  FileTextIcon,
  FileVideoIcon,
  LinkSimpleIcon,
  SpinnerGapIcon,
  UploadSimpleIcon,
} from '@phosphor-icons/react';
import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import type { ImportMode } from '../../shared/api';
import type { Inspection } from '../../shared/generated';
import { Button, Field, Input, PageHeader, SelectControl } from '../components/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { duration, errorMessage, platformLabel, videoFormatLabel } from '../lib/format';

export function Workspace({
  ready,
  importMode,
  onImportMode,
  busy,
  onImport,
  onTaskCreated,
}: {
  ready: boolean;
  importMode: ImportMode;
  onImportMode(mode: ImportMode): void;
  busy: boolean;
  onImport(kind: 'video' | 'document'): void;
  onTaskCreated(): void;
}) {
  const [mode, setMode] = useState('link');
  const [url, setUrl] = useState('');
  const urlRef = useRef('');
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [selectedFormat, setSelectedFormat] = useState('');
  const sourceUrl = (value: string) =>
    value.match(/https?:\/\/[^\s<>]+/)?.[0]?.replace(/[。，；？！、）\])}]+$/, '') ?? value.trim();
  const inspect = useMutation({
    mutationFn: (source: string) => window.desktop.inspect(source),
    onMutate: () => {
      toast.loading('正在解析媒体…', { id: 'inspection' });
    },
    onSuccess: (result, source) => {
      if (source !== sourceUrl(urlRef.current)) {
        toast.dismiss('inspection');
        return;
      }
      setInspection(result);
      setSelectedFormat(result.formats[0]?.id ?? '');
      toast.success('媒体解析完成', { id: 'inspection' });
    },
    onError: (error) => toast.error(errorMessage(error), { id: 'inspection' }),
  });
  const download = useMutation({
    mutationFn: () => {
      if (!inspection) throw new Error('请先解析媒体');
      const format = inspection.formats.find((item) => item.id === selectedFormat);
      return window.desktop.download({
        url: inspection.url,
        format_id: format?.id ?? null,
        height: format?.height ?? null,
        container:
          format?.ext === 'mp4' || format?.ext === 'webm' || format?.ext === 'mkv'
            ? format.ext
            : null,
        operation_id: crypto.randomUUID(),
      });
    },
    onSuccess: () => {
      toast.success('已创建下载任务');
      onTaskCreated();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <div className="flex flex-col gap-10 sm:gap-12">
      <PageHeader
        size="lg"
        title="把素材，带回本地。"
        description="解析公开视频链接，或导入本地视频与剧本文档。"
      />
      <Tabs className="w-full gap-6" value={mode} onValueChange={setMode}>
        <TabsList aria-label="选择内容来源" className="max-w-full">
          <TabsTrigger disabled={!ready} value="link">
            <LinkSimpleIcon aria-hidden />
            链接解析
          </TabsTrigger>
          <TabsTrigger disabled={!ready} value="video">
            <FileVideoIcon aria-hidden />
            本地视频
          </TabsTrigger>
          <TabsTrigger disabled={!ready} value="document">
            <FileTextIcon aria-hidden />
            剧本文档
          </TabsTrigger>
        </TabsList>
        <TabsContent value="link" className="flex flex-col gap-6">
          <form
            className="flex flex-col gap-3 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              setInspection(null);
              inspect.mutate(sourceUrl(url));
            }}
          >
            <Input
              aria-label="视频链接"
              placeholder="粘贴公开媒体链接或完整分享文案"
              controlSize="xl"
              value={url}
              onChange={(event) => {
                setUrl(event.target.value);
                urlRef.current = event.target.value;
                setInspection(null);
              }}
              required
              disabled={!ready || inspect.isPending}
            />
            <Button type="submit" size="xl" disabled={!ready || !url.trim() || inspect.isPending}>
              {inspect.isPending ? (
                <SpinnerGapIcon data-icon="inline-start" className="animate-spin" />
              ) : (
                <LinkSimpleIcon data-icon="inline-start" />
              )}
              {inspect.isPending ? '解析中…' : inspection ? '重新解析' : '解析媒体'}
            </Button>
          </form>
          <p className="text-sm text-muted-foreground">
            支持 YouTube、Bilibili 的公开视频。链接解析与下载需要网络，文件保存在本机。
          </p>
          {inspection && (
            <section className="grid gap-6 lg:grid-cols-2">
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">
                  {platformLabel(inspection.platform)}
                </p>
                <h2 className="text-xl font-medium">{inspection.title}</h2>
                <p className="text-sm text-muted-foreground">
                  时长 {duration(inspection.duration_seconds)}
                </p>
              </div>
              {inspection.can_download && inspection.formats.length ? (
                <div className="flex flex-col gap-4">
                  <Field label="下载版本">
                    <SelectControl
                      value={selectedFormat}
                      onValueChange={setSelectedFormat}
                      options={inspection.formats.map((format) => ({
                        value: format.id,
                        label: videoFormatLabel(format),
                      }))}
                    />
                  </Field>
                  <Button
                    disabled={download.isPending || !selectedFormat}
                    onClick={() => download.mutate()}
                  >
                    {download.isPending ? (
                      <SpinnerGapIcon data-icon="inline-start" className="animate-spin" />
                    ) : (
                      <ArrowDownIcon data-icon="inline-start" />
                    )}
                    {download.isPending ? '正在创建任务…' : '下载到本机'}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  当前来源未通过下载检查，请导入已取得的本地文件。
                </p>
              )}
            </section>
          )}
        </TabsContent>
        {(['video', 'document'] as const).map((kind) => (
          <TabsContent value={kind} key={kind} className="flex flex-col gap-6">
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                controlSize="xl"
                aria-label={kind === 'video' ? '本地视频文件' : '剧本文档文件'}
                readOnly
                placeholder={
                  kind === 'video'
                    ? '选择本地 MP4 视频，或将文件拖入窗口'
                    : '选择 TXT、Markdown、Fountain、PDF 或 DOCX 文档'
                }
              />
              <Button size="xl" disabled={!ready || busy} onClick={() => onImport(kind)}>
                {busy ? (
                  <SpinnerGapIcon data-icon="inline-start" className="animate-spin" />
                ) : (
                  <UploadSimpleIcon data-icon="inline-start" />
                )}
                {busy ? '正在导入…' : kind === 'video' ? '导入视频' : '导入文档'}
              </Button>
            </div>
            <div className="flex max-w-lg flex-col gap-4">
              <Field
                label="导入方式"
                hint={
                  importMode === 'reference'
                    ? '保留原文件位置。请勿移动或删除已引用的文件。'
                    : '副本保存在本机文件目录，原文件移动后仍可使用。'
                }
              >
                <SelectControl
                  value={importMode}
                  onValueChange={(value) => onImportMode(value as ImportMode)}
                  options={[
                    { value: 'reference', label: '引用原文件' },
                    { value: 'copy', label: '复制到文件目录' },
                  ]}
                />
              </Field>
              <p className="text-sm text-muted-foreground">
                {kind === 'video'
                  ? '支持本地 MP4。导入后可预览视频、查看媒体信息并开始 AI 分析。'
                  : '支持文本、Markdown、Fountain、文字型 PDF 与 DOCX。导入后可查看提取文本并开始剧本分析。'}
              </p>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
