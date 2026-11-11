export const ENGINE_ORDER: API.AiProviderEngine[] = [
  'volcengine',
  'deepseek',
  'openai',
];

export const OFFICIAL_PROVIDER_PRESET_DEFAULTS: API.AiProviderPresetResponse[] =
  [
    {
      id: 'volcengine-ark-v3',
      engine: 'volcengine',
      display_name: '按量付费 V3',
      base_url: 'https://ark.cn-beijing.volces.com/api/v3',
      default_model: 'doubao-seed-2-0-lite',
      suggested_models: [
        {
          id: 'doubao-seed-2-0-lite',
          label: 'Doubao Seed 2.0 Lite',
          supports_vision: true,
        },
        {
          id: 'doubao-1.5-vision-pro',
          label: 'Doubao 1.5 Vision Pro',
          supports_vision: true,
        },
        {
          id: 'doubao-seed-1.6',
          label: 'Doubao Seed 1.6',
          supports_vision: true,
        },
      ],
      supports_vision: true,
      supports_models_endpoint: true,
      structured_output_mode: 'json_schema',
      endpoint_kind: 'payg',
      supports_custom_model_id: true,
      key_isolation_notice:
        '使用方舟常规 V3 按量付费 API Key；请勿与 Coding Plan 或 Agent Plan 套餐密钥混用。',
    },
    {
      id: 'volcengine-coding-v3',
      engine: 'volcengine',
      display_name: 'Coding Plan V3',
      base_url: 'https://ark.cn-beijing.volces.com/api/coding/v3',
      default_model: 'ark-code-latest',
      suggested_models: [
        {
          id: 'ark-code-latest',
          label: 'Ark Code Latest（智能编程）',
          supports_vision: false,
        },
      ],
      supports_vision: false,
      supports_models_endpoint: false,
      structured_output_mode: 'json_schema',
      endpoint_kind: 'coding_plan',
      supports_custom_model_id: true,
      key_isolation_notice:
        '仅用于方舟 Coding Plan 专属 API Key，禁止与按量付费或 Agent Plan 套餐密钥混用。',
    },
    {
      id: 'volcengine-agent-v3',
      engine: 'volcengine',
      display_name: 'Agent Plan V3',
      base_url: 'https://ark.cn-beijing.volces.com/api/plan/v3',
      default_model: 'doubao-seed-2-0-lite',
      suggested_models: [
        {
          id: 'doubao-seed-2-0-lite',
          label: 'Doubao Seed 2.0 Lite',
          supports_vision: true,
        },
      ],
      supports_vision: true,
      supports_models_endpoint: false,
      structured_output_mode: 'json_schema',
      endpoint_kind: 'agent_plan',
      supports_custom_model_id: true,
      key_isolation_notice:
        '仅用于方舟 Agent Plan 专属 API Key，禁止与按量付费或 Coding Plan 套餐密钥混用。',
    },
    {
      id: 'deepseek-official',
      engine: 'deepseek',
      display_name: '官方直连',
      base_url: 'https://api.deepseek.com',
      default_model: 'deepseek-chat',
      suggested_models: [
        {
          id: 'deepseek-chat',
          label: 'DeepSeek Chat (V3)',
          supports_vision: false,
        },
        {
          id: 'deepseek-reasoner',
          label: 'DeepSeek Reasoner (R1)',
          supports_vision: false,
        },
      ],
      supports_vision: false,
      supports_models_endpoint: true,
      structured_output_mode: 'json_object',
      endpoint_kind: 'official',
      supports_custom_model_id: false,
      key_isolation_notice: '仅支持文本/剧本/文档类 Skill，不接收视频图像帧。',
    },
    {
      id: 'openai-official',
      engine: 'openai',
      display_name: '官方直连',
      base_url: 'https://api.openai.com/v1',
      default_model: 'gpt-4.1-mini',
      suggested_models: [
        {
          id: 'gpt-4.1-mini',
          label: 'GPT-4.1 Mini',
          supports_vision: true,
        },
        {
          id: 'gpt-4.1',
          label: 'GPT-4.1',
          supports_vision: true,
        },
        {
          id: 'gpt-4o',
          label: 'GPT-4o',
          supports_vision: true,
        },
      ],
      supports_vision: true,
      supports_models_endpoint: true,
      structured_output_mode: 'json_schema',
      endpoint_kind: 'official',
      supports_custom_model_id: false,
      key_isolation_notice:
        'OpenAI 官方平台直连，支持 Strict JSON Schema 与多模态视觉分析。',
    },
  ];

export type AiServiceDraft = {
  engine: API.AiProviderEngine;
  presetId: string;
  model: string;
  apiKey: string;
  saving: boolean;
  testing: boolean;
  error: string;
  testResult: API.AiProviderConnectionTestResponse | null;
  testError: string;
};

export function createDraftFromService(
  service: API.AiProviderProfileResponse,
): AiServiceDraft {
  return {
    engine: service.engine,
    presetId: service.preset_id,
    model: service.model,
    apiKey: '',
    saving: false,
    testing: false,
    error: '',
    testResult: null,
    testError: '',
  };
}

export function pickInitialEngine(
  items: API.AiProviderProfileResponse[],
  preferred?: API.AiProviderEngine | null,
): API.AiProviderEngine {
  if (preferred && items.some((item) => item.engine === preferred)) {
    return preferred;
  }
  const active = items.find((item) => item.is_active);
  if (active) return active.engine;
  const configured = items.find((item) => item.credential_configured);
  if (configured) return configured.engine;
  return items[0]?.engine ?? 'volcengine';
}

export function resolveActivePreset(
  service: API.AiProviderProfileResponse,
  presetId?: string,
): API.AiProviderPresetResponse {
  const presets = service.presets.length
    ? service.presets
    : providerPresetsForEngine(service.engine);
  return (
    presets.find((item) => item.id === presetId) ??
    presets.find((item) => item.id === service.preset_id) ??
    presets[0]
  );
}

export function providerPresetsForEngine(
  engine: API.AiProviderEngine,
): API.AiProviderPresetResponse[] {
  return OFFICIAL_PROVIDER_PRESET_DEFAULTS.filter(
    (item) => item.engine === engine,
  );
}

export function providerEngineLabel(engine: API.AiProviderEngine): string {
  switch (engine) {
    case 'volcengine':
      return '火山引擎方舟';
    case 'deepseek':
      return 'DeepSeek';
    case 'openai':
      return 'OpenAI';
  }
}

export function endpointKindLabel(kind: string): string {
  switch (kind) {
    case 'payg':
      return '按量付费 V3';
    case 'coding_plan':
      return 'Coding Plan V3';
    case 'agent_plan':
      return 'Agent Plan V3';
    default:
      return '官方直连';
  }
}

export function structuredOutputLabel(
  mode: API.AiProviderProfileResponse['structured_output_mode'],
): string {
  return mode === 'json_schema' ? '严格 JSON Schema' : 'JSON Object';
}

export function inferModelSupportsVision(
  engine: API.AiProviderEngine,
  model: string,
  baseUrl: string,
): { supportsVision: boolean; uncertain: boolean } {
  const normalizedModel = model.trim().toLowerCase();
  const normalizedUrl = baseUrl.trim().toLowerCase();
  if (engine === 'deepseek') {
    return { supportsVision: false, uncertain: false };
  }
  if (engine === 'volcengine') {
    if (normalizedModel.startsWith('ep-')) {
      return { supportsVision: true, uncertain: true };
    }
    if (
      normalizedUrl.includes('/api/coding/v3') &&
      normalizedModel === 'ark-code-latest'
    ) {
      return { supportsVision: false, uncertain: false };
    }
    if (
      normalizedModel.includes('vision') ||
      normalizedModel.includes('doubao-seed') ||
      normalizedModel.includes('vl')
    ) {
      return { supportsVision: true, uncertain: false };
    }
    if (!normalizedModel) return { supportsVision: true, uncertain: true };
    return { supportsVision: true, uncertain: true };
  }
  if (
    normalizedModel.startsWith('o1') ||
    normalizedModel.startsWith('o3') ||
    normalizedModel.startsWith('o4') ||
    normalizedModel.startsWith('gpt-3.5') ||
    normalizedModel === 'gpt-4'
  ) {
    return { supportsVision: false, uncertain: false };
  }
  if (
    normalizedModel.startsWith('gpt-4.1') ||
    normalizedModel.startsWith('gpt-4o') ||
    normalizedModel.startsWith('gpt-5') ||
    normalizedModel.includes('vision')
  ) {
    return { supportsVision: true, uncertain: false };
  }
  return { supportsVision: true, uncertain: true };
}
