import { useEffect, useState } from 'react';
import type { ProviderInput } from '../../shared/api';
import type { Provider } from '../../shared/generated';
import { Button, Dialog, Field } from '../components/ui';
import { errorMessage } from '../lib/format';

export function ProviderDialog({
  open,
  provider,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  provider: Provider | null;
  onOpenChange(open: boolean): void;
  onSave(input: ProviderInput): Promise<void>;
}) {
  const [label, setLabel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [key, setKey] = useState('');
  const [vision, setVision] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setLabel(provider?.label ?? '');
      setBaseUrl(provider?.base_url ?? '');
      setModel(provider?.model ?? '');
      setVision(provider?.vision ?? false);
      setKey('');
      setError(null);
    } else setKey('');
  }, [open, provider]);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={provider ? '编辑模型服务' : '添加模型服务'}
      description="使用自己的兼容 Chat Completions API。密钥由本机系统保护，不进入媒体或报告。"
    >
      <form
        className="provider-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setBusy(true);
          try {
            await onSave({
              id: provider?.id,
              label: label.trim(),
              base_url: baseUrl.trim(),
              model: model.trim(),
              vision,
              ...(key.trim() ? { api_key: key.trim() } : {}),
            });
            onOpenChange(false);
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setKey('');
            setBusy(false);
          }
        }}
      >
        <Field label="名称">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="例如：我的模型服务"
            required
            maxLength={100}
          />
        </Field>
        <Field label="API 地址" hint="填写包含 /v1 的服务根地址；云端服务使用 HTTPS。">
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://example.com/v1"
            type="url"
            required
            autoComplete="off"
          />
        </Field>
        <Field label="模型名称">
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="服务中可用的模型 ID"
            required
            maxLength={200}
          />
        </Field>
        <Field
          label="API Key"
          hint={
            provider?.key_set
              ? '地址保持不变时，留空保留现有密钥；更换地址需要重新输入。'
              : '仅在你主动发起分析时发送给配置的模型服务。'
          }
        >
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            type="password"
            autoComplete="new-password"
            placeholder={provider?.key_set ? '已配置 · 留空保持' : '输入你的 API Key'}
          />
        </Field>
        <label className="checkbox-field">
          <input type="checkbox" checked={vision} onChange={(e) => setVision(e.target.checked)} />
          <span>这个模型可以接收图像，用于视频分析</span>
        </label>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <Button variant="secondary" disabled={busy} onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? '正在保存…' : '保存服务'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
