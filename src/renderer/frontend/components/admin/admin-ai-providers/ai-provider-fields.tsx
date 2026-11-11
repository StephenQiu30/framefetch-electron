import {
  CheckCircle,
  Eye,
  Key,
  PlugsConnected,
  TextT,
  WarningCircle,
} from '@phosphor-icons/react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  type AiProviderEditorState,
  endpointKindLabel,
  findMatchingPreset,
  inferModelSupportsVision,
  providerApiBaseUrl,
  providerEngineDefaults,
  providerEngineLabel,
  providerPresetsForEngine,
} from './model';

export function AiProviderFields({
  editor,
  onChange,
  presets,
}: {
  editor: AiProviderEditorState;
  onChange: (values: Partial<AiProviderEditorState>) => void;
  presets?: readonly API.AiProviderPresetResponse[];
}) {
  const creating = editor.mode === 'create';
  const busy = editor.saving || editor.testing;
  const enginePresets = providerPresetsForEngine(editor.engine, presets);
  const activePreset = findMatchingPreset(
    editor.engine,
    editor.baseUrl,
    presets,
  );
  const visionState = inferModelSupportsVision(
    editor.engine,
    editor.model,
    editor.baseUrl,
    presets,
  );

  return (
    <FieldGroup className="gap-6">
      <FieldGroup className="grid gap-6 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="ai-provider-key">配置标识</FieldLabel>
          <Input
            autoComplete="off"
            disabled={!creating || busy}
            id="ai-provider-key"
            maxLength={32}
            onChange={(event) => onChange({ key: event.target.value })}
            pattern="[a-z][a-z0-9_-]{0,31}"
            placeholder="volcengine-main"
            required
            value={editor.key}
          />
          <FieldDescription>创建后不可修改。</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="ai-provider-name">显示名称</FieldLabel>
          <Input
            disabled={busy}
            id="ai-provider-name"
            maxLength={64}
            onChange={(event) => onChange({ displayName: event.target.value })}
            placeholder="火山引擎方舟主线路"
            required
            value={editor.displayName}
          />
        </Field>
      </FieldGroup>

      <FieldGroup className="grid gap-6 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="ai-provider-engine">官方渠道</FieldLabel>
          <Select
            disabled={busy}
            onValueChange={(engine: API.AiProviderEngine) =>
              onChange({
                engine,
                ...providerEngineDefaults(engine, presets),
                apiKey: '',
                credentialConfigured: false,
                testResult: null,
                testError: '',
              })
            }
            value={editor.engine}
          >
            <SelectTrigger className="w-full" id="ai-provider-engine">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="volcengine">火山引擎方舟（Ark）</SelectItem>
                <SelectItem value="deepseek">DeepSeek 官方</SelectItem>
                <SelectItem value="openai">OpenAI 官方</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="ai-provider-auth">认证方式</FieldLabel>
          <Select disabled value={editor.authMode}>
            <SelectTrigger className="w-full" id="ai-provider-auth">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="api_key">
                  官方 API Key（加密保存）
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>

      {enginePresets.length > 1 ? (
        <Field>
          <FieldLabel>套餐与端点预设</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {enginePresets.map((preset) => {
              const selected = activePreset?.id === preset.id;
              return (
                <Button
                  aria-pressed={selected}
                  disabled={busy}
                  key={preset.id}
                  onClick={() => {
                    const urlChanged = preset.base_url !== editor.baseUrl;
                    onChange({
                      baseUrl: preset.base_url,
                      model: preset.default_model,
                      ...(urlChanged
                        ? { apiKey: '', credentialConfigured: false }
                        : {}),
                      testResult: null,
                      testError: '',
                    });
                  }}
                  size="sm"
                  type="button"
                  variant={selected ? 'secondary' : 'outline'}
                >
                  {endpointKindLabel(preset.endpoint_kind)}
                </Button>
              );
            })}
          </div>
          <FieldDescription>
            {providerEngineLabel(editor.engine)} 按量 V3、Coding Plan 与 Agent
            Plan 的 API Key 与计费相互隔离。
          </FieldDescription>
        </Field>
      ) : null}

      {activePreset?.key_isolation_notice ? (
        <Alert>
          <AlertTitle>{activePreset.display_name}</AlertTitle>
          <AlertDescription>
            {activePreset.key_isolation_notice}
          </AlertDescription>
        </Alert>
      ) : null}

      <Field>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <FieldLabel htmlFor="ai-provider-model">模型</FieldLabel>
          <Badge variant={visionState.supportsVision ? 'secondary' : 'outline'}>
            {visionState.supportsVision ? (
              <>
                <Eye aria-hidden />
                {visionState.uncertain
                  ? '接入点能力取决于后端部署模型'
                  : '支持多模态视频与文本 Skill'}
              </>
            ) : (
              <>
                <TextT aria-hidden />
                纯文本模型（仅支持剧本与文档 Skill）
              </>
            )}
          </Badge>
        </div>
        <Input
          disabled={busy}
          id="ai-provider-model"
          maxLength={128}
          onChange={(event) =>
            onChange({
              model: event.target.value,
              testResult: null,
              testError: '',
            })
          }
          placeholder={
            editor.engine === 'volcengine'
              ? '输入官方 Model ID 或方舟接入点（ep-...）'
              : '选择推荐模型或输入官方模型 ID'
          }
          required
          value={editor.model}
        />
        {activePreset && activePreset.suggested_models.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {activePreset.suggested_models.map((item) => {
              const selected =
                editor.model.trim().toLowerCase() === item.id.toLowerCase();
              return (
                <Button
                  aria-pressed={selected}
                  disabled={busy}
                  key={item.id}
                  onClick={() =>
                    onChange({
                      model: item.id,
                      testResult: null,
                      testError: '',
                    })
                  }
                  size="sm"
                  type="button"
                  variant={selected ? 'secondary' : 'outline'}
                >
                  {item.label}
                </Button>
              );
            })}
          </div>
        ) : null}
        <FieldDescription>
          {editor.engine === 'volcengine'
            ? '支持推荐模型 ID，也可手动填写自定义推理接入点 ID（例如 ep-2026xxxx）。'
            : '视频帧视觉分析需要多模态模型；纯文本模型可执行剧本生成等非视觉 Skill。'}
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor="ai-provider-url">API Base URL</FieldLabel>
        <Input
          autoCapitalize="none"
          autoComplete="url"
          disabled={busy}
          id="ai-provider-url"
          maxLength={2048}
          onChange={(event) =>
            onChange({
              baseUrl: event.target.value,
              credentialConfigured: false,
              testResult: null,
              testError: '',
            })
          }
          placeholder={providerApiBaseUrl(editor.engine)}
          required
          type="url"
          value={editor.baseUrl}
        />
        <FieldDescription>
          仅允许官方 HTTPS 端点或可信方舟区域端点；变更地址时需重新提供 API
          Key。
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor="ai-provider-secret">API Key</FieldLabel>
        <Input
          autoComplete="new-password"
          disabled={busy}
          id="ai-provider-secret"
          maxLength={4096}
          onChange={(event) =>
            onChange({
              apiKey: event.target.value,
              testResult: null,
              testError: '',
            })
          }
          placeholder={
            creating || !editor.credentialConfigured
              ? '填写官方 API Key'
              : '已配置；留空表示保持原有加密凭据'
          }
          required={creating || !editor.credentialConfigured}
          type="password"
          value={editor.apiKey}
        />
        <FieldDescription className="flex items-center gap-1.5">
          <Key aria-hidden />
          仅支持加密入库并下发给容器化 analysis-worker，保存后不回传明文。
        </FieldDescription>
      </Field>

      {editor.testResult ? (
        <ConnectionTestNotice
          onSelectModel={(model) => onChange({ model })}
          result={editor.testResult}
        />
      ) : null}

      {editor.testError ? (
        <Alert variant="destructive">
          <PlugsConnected aria-hidden />
          <AlertTitle>连通性测试未完成</AlertTitle>
          <AlertDescription>{editor.testError}</AlertDescription>
        </Alert>
      ) : null}

      {editor.error ? (
        <Alert variant="destructive">
          <WarningCircle aria-hidden />
          <AlertDescription>{editor.error}</AlertDescription>
        </Alert>
      ) : null}
    </FieldGroup>
  );
}

function ConnectionTestNotice({
  onSelectModel,
  result,
}: {
  onSelectModel: (model: string) => void;
  result: API.AiProviderConnectionTestResponse;
}) {
  return (
    <Alert variant={result.ok ? 'default' : 'destructive'}>
      {result.ok ? <CheckCircle aria-hidden /> : <WarningCircle aria-hidden />}
      <AlertTitle>
        {result.ok ? '官方通道连通正常' : '官方通道校验失败'}
        {result.latency_ms !== null ? ` · ${result.latency_ms} ms` : ''}
      </AlertTitle>
      <AlertDescription className="grid gap-2">
        <span>{result.message}</span>
        {result.capability_notice ? (
          <span>{result.capability_notice}</span>
        ) : null}
        {result.vision_notice ? <span>{result.vision_notice}</span> : null}
        {result.discovered_models.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-muted-foreground">探测到的模型：</span>
            {result.discovered_models.slice(0, 6).map((modelId) => (
              <Button
                key={modelId}
                onClick={() => onSelectModel(modelId)}
                size="xs"
                type="button"
                variant="outline"
              >
                {modelId}
              </Button>
            ))}
          </div>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
