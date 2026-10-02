import { useEffect, useState } from 'react';
import type { ProviderInput } from '../../shared/api';
import type { Provider } from '../../shared/generated';
import { Button, Checkbox, Dialog, Field, Input } from '../components/ui';
import { errorMessage } from '../lib/format';

function normalizedEndpoint(value: string): string {
  try {
    return new URL(value.trim()).href.replace(/\/+$/, '');
  } catch {
    return value.trim();
  }
}

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
  const endpointChanged =
    !!provider && normalizedEndpoint(baseUrl) !== normalizedEndpoint(provider.base_url);
  const keyRequired = !provider?.key_set || endpointChanged;
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!busy) onOpenChange(nextOpen);
      }}
      title={provider ? '编辑 AI 服务' : '新增 AI 服务'}
      description="使用自己的 OpenAI 兼容 API。保存后仅显示凭据状态，不会再次返回 API Key 明文。"
    >
      <form
        className="provider-form"
        onSubmit={async (event) => {
          event.preventDefault();
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
          } catch (saveError) {
            setError(errorMessage(saveError));
          } finally {
            setKey('');
            setBusy(false);
          }
        }}
      >
        <Field label="显示名称">
          <Input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="例如：我的 AI 服务"
            required
            disabled={busy}
            maxLength={120}
          />
        </Field>
        <Field label="API Base URL" hint="填写服务根地址（例如包含 /v1）；公网地址必须使用 HTTPS。">
          <Input
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder="https://example.com/v1"
            type="url"
            required
            disabled={busy}
            maxLength={2048}
            autoCapitalize="none"
            autoComplete="url"
          />
        </Field>
        <Field label="模型" hint="视频分析要求模型支持图像输入和结构化输出。">
          <Input
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder="填写服务支持的模型 ID"
            required
            disabled={busy}
            maxLength={200}
          />
        </Field>
        <Field
          label="API Key"
          hint={
            endpointChanged
              ? 'API Base URL 已变化，请重新输入 API Key。'
              : provider?.key_set
                ? '已配置；留空表示不修改。更换服务地址时需要重新输入。'
                : '仅在你主动发起分析时发送给配置的 AI 服务。'
          }
        >
          <Input
            value={key}
            onChange={(event) => setKey(event.target.value)}
            type="password"
            autoComplete="new-password"
            required={keyRequired}
            disabled={busy}
            maxLength={8192}
            placeholder={keyRequired ? '填写服务凭据' : '已配置；留空表示不修改'}
          />
        </Field>
        <Field label="支持图像输入" hint="视频分析需要图像输入能力；纯文本模型可以用于剧本分析。">
          <Checkbox
            checked={vision}
            onCheckedChange={(checked) => setVision(checked === true)}
            disabled={busy}
          />
        </Field>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? '正在保存…' : '保存配置'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
