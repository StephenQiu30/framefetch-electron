'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  activateAiProviderProfile,
  clearFallbackAiProviderProfile,
  createAiProviderProfile,
  deleteAiProviderProfile,
  listAiProviderPresets,
  listAiProviderProfiles,
  setFallbackAiProviderProfile,
  testAiProviderConnection,
  updateAiProviderProfile,
} from '@/api/admin';
import { AiProviderDelete } from '@/components/admin/admin-ai-providers/ai-provider-delete';
import { AiProviderEditor } from '@/components/admin/admin-ai-providers/ai-provider-editor';
import { AiProviderScreen } from '@/components/admin/admin-ai-providers/ai-provider-screen';
import {
  type AiProviderEditorState,
  EMPTY_AI_PROVIDER_EDITOR,
  OFFICIAL_PROVIDER_PRESET_DEFAULTS,
  providerApiBaseUrl,
  providerEngineDefaults,
} from '@/components/admin/admin-ai-providers/model';
import { displayError } from '@/lib/request-error';

export function AdminAiProvidersView() {
  const [items, setItems] = useState<API.AiProviderProfileResponse[]>([]);
  const [presets, setPresets] = useState<
    readonly API.AiProviderPresetResponse[]
  >(OFFICIAL_PROVIDER_PRESET_DEFAULTS);
  const [agentAvailable, setAgentAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState<AiProviderEditorState>(
    EMPTY_AI_PROVIDER_EDITOR,
  );
  const [deleteTarget, setDeleteTarget] =
    useState<API.AiProviderProfileResponse | null>(null);
  const [deleting, setDeleting] = useState(false);
  const requestId = useRef(0);
  const editorTrigger = useRef<HTMLElement | null>(null);

  const load = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const [profileResult, presetResult] = await Promise.allSettled([
        listAiProviderProfiles(),
        listAiProviderPresets(),
      ]);
      if (current !== requestId.current) return;
      if (profileResult.status === 'rejected') {
        setError(displayError(profileResult.reason));
        return;
      }
      setItems(profileResult.value.items);
      setAgentAvailable(profileResult.value.agent_available);
      if (
        presetResult.status === 'fulfilled' &&
        presetResult.value?.items?.length > 0
      ) {
        setPresets(presetResult.value.items);
      }
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      requestId.current += 1;
    };
  }, [load]);

  function openCreate() {
    editorTrigger.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setEditor({
      ...EMPTY_AI_PROVIDER_EDITOR,
      ...providerEngineDefaults('volcengine', presets),
      mode: 'create',
    });
  }

  function openEdit(item: API.AiProviderProfileResponse) {
    editorTrigger.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setEditor({
      mode: 'edit',
      key: item.key,
      displayName: item.display_name,
      engine: item.engine,
      authMode: item.auth_mode,
      baseUrl: item.base_url || providerApiBaseUrl(item.engine),
      model: item.model,
      apiKey: '',
      credentialConfigured: item.credential_configured,
      error: '',
      saving: false,
      testing: false,
      testResult: null,
      testError: '',
    });
  }

  async function testConnection() {
    if (!editor.mode) return;
    const baseUrl = editor.baseUrl.trim();
    const model = editor.model.trim();
    const apiKey = editor.apiKey.trim();
    const key = editor.key.trim();
    if (!baseUrl || !model || (!apiKey && !editor.credentialConfigured)) {
      setEditor((current) => ({
        ...current,
        testResult: null,
        testError: '测试连接前请填写模型、服务地址与所需 API Key。',
      }));
      return;
    }
    setEditor((current) => ({
      ...current,
      testing: true,
      testResult: null,
      testError: '',
    }));
    try {
      const result = await testAiProviderConnection({
        ...(editor.mode === 'edit' && key ? { provider_key: key } : {}),
        engine: editor.engine,
        auth_mode: editor.authMode,
        base_url: baseUrl,
        model,
        ...(apiKey ? { api_key: apiKey } : {}),
      });
      setEditor((current) => ({
        ...current,
        testing: false,
        testResult: result,
        testError: '',
      }));
    } catch (reason) {
      setEditor((current) => ({
        ...current,
        testing: false,
        testResult: null,
        testError: displayError(reason),
      }));
    }
  }

  async function saveEditor() {
    if (!editor.mode) return;
    const key = editor.key.trim();
    const displayName = editor.displayName.trim();
    const model = editor.model.trim();
    const baseUrl = editor.baseUrl.trim();
    const apiKey = editor.apiKey.trim();
    if (
      !key ||
      !displayName ||
      !model ||
      !baseUrl ||
      (!apiKey && !editor.credentialConfigured)
    ) {
      setEditor((current) => ({
        ...current,
        error: '请补全名称、模型、服务地址与所需凭据。',
      }));
      return;
    }
    setEditor((current) => ({ ...current, saving: true, error: '' }));
    try {
      if (editor.mode === 'create') {
        await createAiProviderProfile({
          key,
          display_name: displayName,
          engine: editor.engine,
          auth_mode: editor.authMode,
          base_url: baseUrl,
          model,
          api_key: apiKey || null,
        });
        toast.success(`已新增 AI Provider“${displayName}”。`);
      } else {
        await updateAiProviderProfile(
          { provider_key: encodeURIComponent(key) },
          {
            display_name: displayName,
            engine: editor.engine,
            auth_mode: editor.authMode,
            base_url: baseUrl,
            model,
            ...(apiKey ? { api_key: apiKey } : {}),
          },
        );
        toast.success(`已更新 AI Provider“${displayName}”。`);
      }
      setEditor(EMPTY_AI_PROVIDER_EDITOR);
      await load();
    } catch (reason) {
      toast.error('保存失败', { description: displayError(reason) });
      setEditor((current) => ({ ...current, saving: false }));
    }
  }

  async function activate(item: API.AiProviderProfileResponse) {
    setError('');
    try {
      await activateAiProviderProfile({
        provider_key: encodeURIComponent(item.key),
      });
      toast.success(`“${item.display_name}”已成为当前分析线路。`);
      await load();
    } catch (reason) {
      toast.error('操作未完成', { description: displayError(reason) });
    }
  }

  async function setFallback(item: API.AiProviderProfileResponse) {
    setError('');
    try {
      await setFallbackAiProviderProfile({
        provider_key: encodeURIComponent(item.key),
      });
      toast.success(`已将“${item.display_name}”设为备用兜底线路。`);
      await load();
    } catch (reason) {
      toast.error('操作未完成', { description: displayError(reason) });
    }
  }

  async function clearFallback(item: API.AiProviderProfileResponse) {
    setError('');
    try {
      await clearFallbackAiProviderProfile({
        provider_key: encodeURIComponent(item.key),
      });
      toast.success(`已取消“${item.display_name}”的备用兜底状态。`);
      await load();
    } catch (reason) {
      toast.error('操作未完成', { description: displayError(reason) });
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteAiProviderProfile({
        provider_key: encodeURIComponent(deleteTarget.key),
      });
      toast.success(`已删除 AI Provider“${deleteTarget.display_name}”。`);
      setDeleteTarget(null);
      await load();
    } catch (reason) {
      toast.error('操作未完成', { description: displayError(reason) });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <AiProviderScreen
        bulk={{
          scope: 'ai-providers',
          disabled:
            loading ||
            deleting ||
            Boolean(editor.mode) ||
            Boolean(deleteTarget),
          description:
            '所选 AI 配置与凭据将永久删除。当前主线路和备用兜底线路不可批量删除。',
          remove: (id) =>
            deleteAiProviderProfile({ provider_key: encodeURIComponent(id) }),
          onComplete: () => load(),
        }}
        agentAvailable={agentAvailable}
        error={error}
        items={items}
        loading={loading}
        onActivate={(item) => void activate(item)}
        onClearFallback={(item) => void clearFallback(item)}
        onCreate={openCreate}
        onDelete={setDeleteTarget}
        onEdit={openEdit}
        onRetry={() => void load()}
        onSetFallback={(item) => void setFallback(item)}
      />
      <AiProviderEditor
        editor={editor}
        onChange={(values) =>
          setEditor((current) => ({ ...current, ...values, error: '' }))
        }
        onClose={() => setEditor(EMPTY_AI_PROVIDER_EDITOR)}
        onRestoreFocus={() => editorTrigger.current?.focus()}
        onSave={() => void saveEditor()}
        onTest={() => void testConnection()}
        presets={presets}
      />
      <AiProviderDelete
        deleting={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
        target={deleteTarget}
      />
    </>
  );
}
