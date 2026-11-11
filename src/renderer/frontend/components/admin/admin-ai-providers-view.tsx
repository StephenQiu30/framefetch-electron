'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import {
  activateAiProviderProfile,
  configureAiProvider,
  deleteAiProviderProfile,
  listAiProviderProfiles,
  testAiProviderConnection,
} from '@/api/admin';
import { AiProviderScreen } from '@/components/admin/admin-ai-providers/ai-provider-screen';
import {
  type AiServiceDraft,
  createDraftFromService,
  pickInitialEngine,
  resolveActivePreset,
} from '@/components/admin/admin-ai-providers/model';
import { displayError } from '@/lib/request-error';

export function AdminAiProvidersView() {
  const [items, setItems] = useState<API.AiProviderProfileResponse[]>([]);
  const [agentAvailable, setAgentAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedEngine, setSelectedEngine] =
    useState<API.AiProviderEngine>('volcengine');
  const [draft, setDraft] = useState<AiServiceDraft | null>(null);
  const [activating, setActivating] = useState(false);
  const [clearTarget, setClearTarget] =
    useState<API.AiProviderProfileResponse | null>(null);
  const [clearing, setClearing] = useState(false);

  const load = useCallback(async (preferredEngine?: API.AiProviderEngine) => {
    setLoading(true);
    setError('');
    try {
      const res = await listAiProviderProfiles();
      const nextItems = res.items ?? [];
      const targetEngine = pickInitialEngine(nextItems, preferredEngine);
      const targetService =
        nextItems.find((item) => item.engine === targetEngine) ?? nextItems[0];
      setItems(nextItems);
      setAgentAvailable(res.agent_available ?? false);
      setSelectedEngine(targetEngine);
      setDraft(targetService ? createDraftFromService(targetService) : null);
    } catch (reason) {
      setError(displayError(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function handleSelect(service: API.AiProviderProfileResponse) {
    setSelectedEngine(service.engine);
    setDraft(createDraftFromService(service));
  }

  async function handleSave() {
    if (!draft) return;
    const service = items.find((item) => item.engine === selectedEngine);
    if (!service) return;
    const preset = resolveActivePreset(service, draft.presetId);
    const endpointChanged =
      service.credential_configured && preset.base_url !== service.base_url;
    const apiKey = draft.apiKey.trim();
    const model = draft.model.trim() || preset.default_model;

    if (!apiKey && (!service.credential_configured || endpointChanged)) {
      setDraft((current) =>
        current ? { ...current, error: '请输入 API Key 后再保存。' } : current,
      );
      return;
    }

    setDraft((current) =>
      current ? { ...current, saving: true, error: '' } : current,
    );
    try {
      await configureAiProvider(
        { engine: selectedEngine },
        {
          preset_id: preset.id,
          model,
          ...(apiKey ? { api_key: apiKey } : {}),
          activate: true,
        },
      );
      toast.success(`已保存并启用“${service.display_name}”。`);
      await load(selectedEngine);
    } catch (reason) {
      toast.error('保存失败', { description: displayError(reason) });
      setDraft((current) =>
        current ? { ...current, saving: false } : current,
      );
    }
  }

  async function handleTest() {
    if (!draft) return;
    const service = items.find((item) => item.engine === selectedEngine);
    if (!service) return;
    const preset = resolveActivePreset(service, draft.presetId);
    const endpointChanged =
      service.credential_configured && preset.base_url !== service.base_url;
    const apiKey = draft.apiKey.trim();
    const model = draft.model.trim() || preset.default_model;

    if (!apiKey && (!service.credential_configured || endpointChanged)) {
      setDraft((current) =>
        current
          ? { ...current, testError: '测试连接前请先填写 API Key。' }
          : current,
      );
      return;
    }

    setDraft((current) =>
      current
        ? { ...current, testing: true, testResult: null, testError: '' }
        : current,
    );
    try {
      const response = await testAiProviderConnection({
        engine: selectedEngine,
        preset_id: preset.id,
        model,
        ...(apiKey ? { api_key: apiKey } : {}),
      });
      setDraft((current) =>
        current
          ? {
              ...current,
              testing: false,
              testResult: response ?? null,
            }
          : current,
      );
    } catch (reason) {
      setDraft((current) =>
        current
          ? { ...current, testing: false, testError: displayError(reason) }
          : current,
      );
    }
  }

  async function handleActivate(service: API.AiProviderProfileResponse) {
    setActivating(true);
    try {
      await activateAiProviderProfile({ engine: service.engine });
      toast.success(`“${service.display_name}”已成为当前分析线路。`);
      await load(service.engine);
    } catch (reason) {
      toast.error('操作未完成', { description: displayError(reason) });
    } finally {
      setActivating(false);
    }
  }

  async function handleClearConfirm() {
    if (!clearTarget) return;
    const targetEngine = clearTarget.engine;
    const targetName = clearTarget.display_name;
    setClearing(true);
    try {
      await deleteAiProviderProfile({ engine: targetEngine });
      toast.success(`已清除“${targetName}”的密钥与配置。`);
      setClearTarget(null);
      await load(targetEngine);
    } catch (reason) {
      toast.error('操作未完成', { description: displayError(reason) });
    } finally {
      setClearing(false);
    }
  }

  return (
    <AiProviderScreen
      activating={activating}
      agentAvailable={agentAvailable}
      clearTarget={clearTarget}
      clearing={clearing}
      draft={draft}
      error={error}
      items={items}
      loading={loading}
      onActivate={(service) => void handleActivate(service)}
      onClearCancel={() => setClearTarget(null)}
      onClearConfirm={() => void handleClearConfirm()}
      onClearRequest={setClearTarget}
      onDraftChange={(patch) =>
        setDraft((current) => (current ? { ...current, ...patch } : current))
      }
      onRetry={() => void load(selectedEngine)}
      onSave={() => void handleSave()}
      onSelect={handleSelect}
      onTest={() => void handleTest()}
      selectedEngine={selectedEngine}
    />
  );
}
