import { ArrowLeft, ArrowSquareOut, FileText, FolderOpen, Sparkle } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { Skill } from '../../shared/api';
import type { Asset, Provider } from '../../shared/generated';
import { Button, Field } from '../components/ui';
import { bytes, duration, errorMessage } from '../lib/format';

export function AssetDetail({
  asset,
  providers,
  onBack,
  onAnalyze,
  onError,
}: {
  asset: Asset;
  providers: Provider[];
  onBack(): void;
  onAnalyze(providerId: string, skill: Skill): Promise<void>;
  onError(message: string): void;
}) {
  const [providerId, setProviderId] = useState(providers[0]?.id ?? '');
  const [skill, setSkill] = useState<Skill>(
    asset.kind === 'video' ? 'comprehensive' : 'screenplay-analysis',
  );
  const [busy, setBusy] = useState(false);
  const media = useQuery({
    queryKey: ['media', asset.id],
    queryFn: () => window.desktop.mediaUrl(asset.id, 'original'),
    enabled: asset.kind === 'video',
    retry: false,
  });
  const text = useQuery({
    queryKey: ['document-text', asset.id],
    queryFn: () => window.desktop.getDocumentText(asset.id),
    enabled: asset.kind === 'document',
  });
  const selectedProvider = providers.find((p) => p.id === providerId);
  const canAnalyze =
    !!selectedProvider &&
    (asset.kind !== 'video' || selectedProvider.vision) &&
    asset.availability === 'available';
  const action = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (error) {
      onError(errorMessage(error));
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
          <span className="eyebrow">{asset.kind === 'video' ? '本地视频' : '剧本文档'}</span>
          <h1>{asset.title}</h1>
          <p className="muted">
            {bytes(asset.size_bytes)}
            {asset.kind === 'video' &&
              ` · ${duration(asset.duration_seconds)} · ${asset.width ?? '—'} × ${asset.height ?? '—'}`}
          </p>
        </div>
        <div className="inline-actions">
          <Button
            variant="secondary"
            onClick={() => action(() => window.desktop.revealAsset(asset.id))}
          >
            <FolderOpen size={18} />
            显示文件
          </Button>
          <Button
            variant="secondary"
            onClick={() => action(() => window.desktop.openAsset(asset.id))}
          >
            <ArrowSquareOut size={18} />
            系统打开
          </Button>
        </div>
      </header>
      <div className="asset-detail-grid">
        <section>
          {asset.kind === 'video' ? (
            <div className="video-container">
              {media.data ? (
                // biome-ignore lint/a11y/useMediaCaption: User imported media has no caption file; do not invent captions.
                <video
                  key={asset.id}
                  src={media.data}
                  controls
                  preload="metadata"
                  aria-label={asset.title}
                  onError={() => onError('此文件未能在内置播放器中打开，可以使用系统播放器。')}
                />
              ) : (
                <p>{media.error ? errorMessage(media.error) : '正在读取本地视频…'}</p>
              )}
            </div>
          ) : (
            <div className="document-preview">
              <div className="section-heading">
                <FileText size={20} />
                <h2>文档内容</h2>
              </div>
              <pre>{text.error ? errorMessage(text.error) : (text.data ?? '正在读取文档…')}</pre>
            </div>
          )}
          <p className="asset-fingerprint">
            <span>SHA-256</span>
            <code>{asset.sha256}</code>
          </p>
        </section>
        <aside className="analysis-panel">
          <Sparkle size={25} />
          <h2>分析这份内容</h2>
          <p className="muted">
            必要文本{asset.kind === 'video' ? '与抽帧' : ''}
            会发送到你选择的模型服务，结果保存到本机。
          </p>
          {providers.length ? (
            <>
              <Field label="模型服务">
                <select value={providerId} onChange={(e) => setProviderId(e.target.value)}>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} · {p.model}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="分析方式">
                <select value={skill} onChange={(e) => setSkill(e.target.value as Skill)}>
                  {asset.kind === 'video' ? (
                    <>
                      <option value="comprehensive">综合视频分析</option>
                      <option value="visual-shots">分镜分析</option>
                      <option value="highlights">高光提取</option>
                      <option value="video-to-article">视频转文章</option>
                    </>
                  ) : (
                    <option value="screenplay-analysis">剧本分析</option>
                  )}
                </select>
              </Field>
              {asset.kind === 'video' && selectedProvider && !selectedProvider.vision && (
                <p className="field-error">请选择启用了视觉输入的模型服务。</p>
              )}
              <Button
                disabled={!canAnalyze || busy}
                className="full-width"
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onAnalyze(providerId, skill);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Sparkle size={18} />
                {busy ? '正在创建任务…' : '开始分析'}
              </Button>
            </>
          ) : (
            <p className="muted">请先在设置中添加自己的模型 API。媒体播放无需模型配置。</p>
          )}
        </aside>
      </div>
    </>
  );
}
