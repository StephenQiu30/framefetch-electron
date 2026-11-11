import { Key, PlugsConnected, Trash } from '@phosphor-icons/react';
import { cn } from 'cn';
import { FeedbackNotice } from '@/components/layout/feedback-notice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';

import {
  type AiServiceDraft,
  inferModelSupportsVision,
  resolveActivePreset,
  structuredOutputLabel,
} from './model';

type AiServiceConfiguratorProps = {
  draft: AiServiceDraft;
  service: API.AiProviderProfileResponse;
  onChange: (patch: Partial<AiServiceDraft>) => void;
  onClearRequest: (service: API.AiProviderProfileResponse) => void;
  onSave: () => void;
  onTest: () => void;
};

export function AiServiceConfigurator({
  draft,
  service,
  onChange,
  onClearRequest,
  onSave,
  onTest,
}: AiServiceConfiguratorProps) {
  const activePreset = resolveActivePreset(service, draft.presetId);
  const endpointChanged =
    service.credential_configured && activePreset.base_url !== service.base_url;
  const requiresApiKey = !service.credential_configured || endpointChanged;
  const trimmedKey = draft.apiKey.trim();
  const canSave =
    !draft.saving &&
    !draft.testing &&
    (!requiresApiKey || trimmedKey.length > 0);
  const canTest =
    !draft.saving &&
    !draft.testing &&
    (!requiresApiKey || trimmedKey.length > 0);
  const visionState = inferModelSupportsVision(
    service.engine,
    draft.model || activePreset.default_model,
    activePreset.base_url,
  );
  const candidateModels = collectCandidateModels(
    activePreset.suggested_models,
    draft.testResult?.discovered_models ?? [],
  );

  function selectPreset(preset: API.AiProviderPresetResponse) {
    const nextEndpointChanged =
      service.credential_configured && preset.base_url !== service.base_url;
    onChange({
      presetId: preset.id,
      model: preset.default_model,
      apiKey: nextEndpointChanged ? '' : draft.apiKey,
      error: '',
      testResult: null,
      testError: '',
    });
  }

  return (
    <section
      aria-label={`配置 ${service.display_name}`}
      className="flex flex-col gap-5 rounded-xl bg-muted/45 p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-medium text-lg text-foreground">
              {service.display_name}
            </h2>
            {service.is_active ? (
              <Badge variant="default">当前分析线路</Badge>
            ) : service.credential_configured ? (
              <Badge variant="secondary">已保存密钥</Badge>
            ) : (
              <Badge variant="secondary">待填入 API Key</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            官方接入地址：{activePreset.base_url} · 结构化输出：
            {structuredOutputLabel(activePreset.structured_output_mode)}
          </p>
        </div>

        {service.credential_configured ? (
          <Button
            disabled={draft.saving || draft.testing}
            onClick={() => onClearRequest(service)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Trash aria-hidden data-icon="inline-start" />
            清除配置
          </Button>
        ) : null}
      </div>

      {draft.error ? (
        <FeedbackNotice description={draft.error} tone="error" />
      ) : null}

      <div className="flex flex-col gap-2">
        <Label
          className="flex items-center gap-1.5"
          htmlFor="ai-service-api-key"
        >
          <Key aria-hidden className="size-3.5 text-muted-foreground" />
          API Key
        </Label>
        <Input
          autoComplete="off"
          id="ai-service-api-key"
          onChange={(event) =>
            onChange({
              apiKey: event.target.value,
              error: '',
              testResult: null,
              testError: '',
            })
          }
          placeholder={
            requiresApiKey
              ? `粘贴 ${service.display_name} 官方 API Key`
              : '已保存加密密钥，留空保持不变，或输入新密钥轮换'
          }
          type="password"
          value={draft.apiKey}
        />
        {endpointChanged ? (
          <p className="text-xs text-muted-foreground">
            已切换官方套餐端点，请填写该套餐对应的 API Key。
          </p>
        ) : null}
      </div>

      {service.presets.length > 1 ? (
        <div className="flex flex-col gap-2">
          <span className="font-medium text-xs text-muted-foreground">
            接入套餐（可选，默认按量付费 V3）
          </span>
          <div className="flex flex-wrap gap-2">
            {service.presets.map((preset) => {
              const selected = preset.id === activePreset.id;
              return (
                <button
                  aria-pressed={selected}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                    selected
                      ? 'bg-foreground text-background'
                      : 'bg-background/70 text-foreground hover:bg-background',
                  )}
                  key={preset.id}
                  onClick={() => selectPreset(preset)}
                  type="button"
                >
                  {preset.display_name}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {activePreset.key_isolation_notice}
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="ai-service-model">模型（已预填官方默认模型）</Label>
          <span className="text-xs text-muted-foreground">
            {visionState.supportsVision
              ? visionState.uncertain
                ? '自定义接入点，请确认模型支持图像输入'
                : '支持多模态视频与文档 Skill'
              : '纯文本模型（仅支持剧本与文档 Skill）'}
          </span>
        </div>
        <Input
          id="ai-service-model"
          onChange={(event) =>
            onChange({
              model: event.target.value,
              error: '',
              testResult: null,
              testError: '',
            })
          }
          placeholder={
            activePreset.supports_custom_model_id
              ? `${activePreset.default_model} 或自定义 ep-...`
              : activePreset.default_model
          }
          value={draft.model}
        />
        {candidateModels.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {candidateModels.map((candidate) => (
              <button
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs transition-colors',
                  draft.model.trim() === candidate.id
                    ? 'bg-foreground text-background'
                    : 'bg-background/70 text-muted-foreground hover:bg-background hover:text-foreground',
                )}
                key={candidate.id}
                onClick={() =>
                  onChange({
                    model: candidate.id,
                    error: '',
                    testResult: null,
                    testError: '',
                  })
                }
                type="button"
              >
                {candidate.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {draft.testError ? (
        <FeedbackNotice description={draft.testError} tone="error" />
      ) : null}
      {draft.testResult ? (
        <FeedbackNotice
          description={`${draft.testResult.vision_notice} ${draft.testResult.capability_notice}`}
          title={
            draft.testResult.latency_ms === null
              ? draft.testResult.message
              : `${draft.testResult.message} · ${draft.testResult.latency_ms} ms`
          }
          tone={draft.testResult.ok ? 'success' : 'error'}
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button disabled={!canSave} onClick={onSave} type="button">
          {draft.saving ? (
            <Spinner aria-hidden data-icon="inline-start" />
          ) : null}
          {draft.saving
            ? '正在保存'
            : service.is_active
              ? '保存配置'
              : '保存并启用'}
        </Button>
        <Button
          disabled={!canTest}
          onClick={onTest}
          type="button"
          variant="secondary"
        >
          {draft.testing ? (
            <Spinner aria-hidden data-icon="inline-start" />
          ) : (
            <PlugsConnected aria-hidden data-icon="inline-start" />
          )}
          {draft.testing ? '正在探测' : '测试连接'}
        </Button>
      </div>
    </section>
  );
}

function collectCandidateModels(
  suggested: API.AiProviderSuggestedModelResponse[],
  discovered: string[],
): Array<{ id: string; label: string }> {
  const seen = new Set<string>();
  const merged: Array<{ id: string; label: string }> = [];
  for (const item of suggested) {
    seen.add(item.id);
    merged.push({ id: item.id, label: item.id });
  }
  for (const id of discovered) {
    if (!seen.has(id)) {
      seen.add(id);
      merged.push({ id, label: id });
    }
  }
  return merged;
}
