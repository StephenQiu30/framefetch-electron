export type AiProviderEditorState = {
  mode: 'create' | 'edit' | null;
  key: string;
  displayName: string;
  engine: API.AiProviderEngine;
  authMode: API.AiProviderAuthMode;
  baseUrl: string;
  model: string;
  apiKey: string;
  credentialConfigured: boolean;
  error: string;
  saving: boolean;
  testing: boolean;
  testResult: API.AiProviderConnectionTestResponse | null;
  testError: string;
};

export const OFFICIAL_PROVIDER_PRESET_DEFAULTS: readonly API.AiProviderPresetResponse[] =
  [
    {
      id: 'volcengine-ark-v3',
      engine: 'volcengine',
      display_name: '火山引擎方舟（按量付费 V3）',
      base_url: 'https://ark.cn-beijing.volces.com/api/v3',
      auth_mode: 'api_key',
      default_model: 'doubao-seed-2-0-lite',
      suggested_models: [
        {
          id: 'doubao-seed-2-0-lite',
          label: 'Doubao Seed 2.0 Lite（多模态）',
          supports_vision: true,
        },
        {
          id: 'doubao-seed-2-0-pro',
          label: 'Doubao Seed 2.0 Pro（多模态）',
          supports_vision: true,
        },
        {
          id: 'doubao-seed-1-6-vision-250815',
          label: 'Doubao Seed 1.6 Vision（多模态）',
          supports_vision: true,
        },
        {
          id: 'deepseek-v3-250324',
          label: 'DeepSeek V3（方舟纯文本）',
          supports_vision: false,
        },
      ],
      supports_vision: true,
      supports_models_endpoint: true,
      structured_output_mode: 'json_schema',
      endpoint_kind: 'payg',
      supports_custom_model_id: true,
      key_isolation_notice:
        '仅使用方舟按量 API Key，禁止与 Coding Plan / Agent Plan 套餐密钥混用；支持官方 Model ID 或接入点 ID（ep-...）。',
    },
    {
      id: 'volcengine-coding-v3',
      engine: 'volcengine',
      display_name: '火山引擎方舟（Coding Plan V3）',
      base_url: 'https://ark.cn-beijing.volces.com/api/coding/v3',
      auth_mode: 'api_key',
      default_model: 'ark-code-latest',
      suggested_models: [
        {
          id: 'ark-code-latest',
          label: 'Ark Code Latest（编码套餐）',
          supports_vision: false,
          notes: 'Coding Plan 套餐默认聚合模型',
        },
        {
          id: 'doubao-seed-code',
          label: 'Doubao Seed Code（纯文本）',
          supports_vision: false,
        },
      ],
      supports_vision: false,
      supports_models_endpoint: false,
      structured_output_mode: 'json_schema',
      endpoint_kind: 'coding_plan',
      supports_custom_model_id: true,
      key_isolation_notice:
        '仅使用方舟 Coding Plan 专属 API Key，不可与按量 V3 或 Agent Plan 混用；该套餐端点不支持 GET /models。',
    },
    {
      id: 'volcengine-agent-v3',
      engine: 'volcengine',
      display_name: '火山引擎方舟（Agent Plan V3）',
      base_url: 'https://ark.cn-beijing.volces.com/api/plan/v3',
      auth_mode: 'api_key',
      default_model: 'doubao-seed-2-0-lite',
      suggested_models: [
        {
          id: 'doubao-seed-2-0-lite',
          label: 'Doubao Seed 2.0 Lite（多模态）',
          supports_vision: true,
        },
        {
          id: 'doubao-seed-2-0-pro',
          label: 'Doubao Seed 2.0 Pro（多模态）',
          supports_vision: true,
        },
      ],
      supports_vision: true,
      supports_models_endpoint: false,
      structured_output_mode: 'json_schema',
      endpoint_kind: 'agent_plan',
      supports_custom_model_id: true,
      key_isolation_notice:
        '仅使用方舟 Agent Plan 专属 API Key，不可与按量 V3 或 Coding Plan 混用；该套餐端点不支持 GET /models。',
    },
    {
      id: 'deepseek-official',
      engine: 'deepseek',
      display_name: 'DeepSeek 官方',
      base_url: 'https://api.deepseek.com',
      auth_mode: 'api_key',
      default_model: 'deepseek-chat',
      suggested_models: [
        {
          id: 'deepseek-chat',
          label: 'DeepSeek Chat（纯文本）',
          supports_vision: false,
        },
        {
          id: 'deepseek-reasoner',
          label: 'DeepSeek Reasoner（纯文本推理）',
          supports_vision: false,
        },
        {
          id: 'deepseek-v4-flash-vision-exp',
          label: 'DeepSeek V4 Flash Vision（多模态）',
          supports_vision: true,
        },
      ],
      supports_vision: true,
      supports_models_endpoint: true,
      structured_output_mode: 'json_object',
      endpoint_kind: 'official',
      supports_custom_model_id: true,
      key_isolation_notice:
        '官方直连 https://api.deepseek.com；纯文本模型可用于剧本与文档类 Skill，视频视觉分析需选择多模态视觉模型。',
    },
    {
      id: 'openai-official',
      engine: 'openai',
      display_name: 'OpenAI 官方',
      base_url: 'https://api.openai.com/v1',
      auth_mode: 'api_key',
      default_model: 'gpt-4.1-mini',
      suggested_models: [
        {
          id: 'gpt-4.1-mini',
          label: 'GPT-4.1 Mini（多模态）',
          supports_vision: true,
        },
        {
          id: 'gpt-4.1',
          label: 'GPT-4.1（多模态）',
          supports_vision: true,
        },
        {
          id: 'gpt-4o',
          label: 'GPT-4o（多模态）',
          supports_vision: true,
        },
        {
          id: 'gpt-4o-mini',
          label: 'GPT-4o Mini（多模态）',
          supports_vision: true,
        },
        {
          id: 'o3-mini',
          label: 'o3-mini（纯文本推理）',
          supports_vision: false,
        },
      ],
      supports_vision: true,
      supports_models_endpoint: true,
      structured_output_mode: 'json_schema',
      endpoint_kind: 'official',
      supports_custom_model_id: true,
      key_isolation_notice:
        '官方直连 https://api.openai.com/v1，原生支持 json_schema strict 与多模态工具调用。',
    },
  ];

export const EMPTY_AI_PROVIDER_EDITOR: AiProviderEditorState = {
  mode: null,
  key: '',
  displayName: '',
  engine: 'volcengine',
  authMode: 'api_key',
  baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
  model: 'doubao-seed-2-0-lite',
  apiKey: '',
  credentialConfigured: false,
  error: '',
  saving: false,
  testing: false,
  testResult: null,
  testError: '',
};

const ENGINE_LABELS = {
  volcengine: '火山引擎方舟',
  deepseek: 'DeepSeek 官方',
  openai: 'OpenAI 官方',
} satisfies Record<API.AiProviderEngine, string>;

const ENDPOINT_KIND_LABELS: Record<string, string> = {
  payg: '按量付费 V3',
  coding_plan: 'Coding Plan V3',
  agent_plan: 'Agent Plan V3',
  official: '官方直连',
};

const API_BASE_URLS = {
  volcengine: 'https://ark.cn-beijing.volces.com/api/v3',
  deepseek: 'https://api.deepseek.com',
  openai: 'https://api.openai.com/v1',
} satisfies Record<API.AiProviderEngine, string>;

function normalizePresets(
  presets?: readonly API.AiProviderPresetResponse[],
): readonly API.AiProviderPresetResponse[] {
  return presets && presets.length > 0
    ? presets
    : OFFICIAL_PROVIDER_PRESET_DEFAULTS;
}

export function providerPresetsForEngine(
  engine: API.AiProviderEngine,
  presets?: readonly API.AiProviderPresetResponse[],
): API.AiProviderPresetResponse[] {
  return normalizePresets(presets).filter((item) => item.engine === engine);
}

function normalizedPathname(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    return parsed.pathname.replace(/\/+$/, '') || '/';
  } catch {
    return trimmed.replace(/\/+$/, '');
  }
}

export function findMatchingPreset(
  engine: API.AiProviderEngine,
  baseUrl: string,
  presets?: readonly API.AiProviderPresetResponse[],
): API.AiProviderPresetResponse | undefined {
  const candidates = providerPresetsForEngine(engine, presets);
  if (candidates.length === 0) return undefined;
  const path = normalizedPathname(baseUrl);
  if (path) {
    const exact = candidates.find(
      (preset) => normalizedPathname(preset.base_url) === path,
    );
    if (exact) return exact;
  }
  return candidates[0];
}

export function providerEngineDefaults(
  engine: API.AiProviderEngine,
  presets?: readonly API.AiProviderPresetResponse[],
): Pick<AiProviderEditorState, 'authMode' | 'baseUrl' | 'model'> {
  const primary = providerPresetsForEngine(engine, presets)[0];
  return {
    authMode: 'api_key',
    baseUrl: primary ? primary.base_url : providerApiBaseUrl(engine),
    model: primary ? primary.default_model : '',
  };
}

export function providerEngineLabel(engine: API.AiProviderEngine): string {
  return ENGINE_LABELS[engine];
}

export function endpointKindLabel(kind: string): string {
  return ENDPOINT_KIND_LABELS[kind] ?? kind;
}

export function providerApiBaseUrl(engine: API.AiProviderEngine): string {
  return API_BASE_URLS[engine];
}

const OPENAI_TEXT_ONLY_PREFIXES = [
  'o1-mini',
  'o1-preview',
  'o3-mini',
  'gpt-3.5',
  'text-',
];

export function inferModelSupportsVision(
  engine: API.AiProviderEngine,
  model: string,
  baseUrl: string,
  presets?: readonly API.AiProviderPresetResponse[],
): { supportsVision: boolean; uncertain: boolean } {
  const normalized = model.trim().toLowerCase();
  const preset = findMatchingPreset(engine, baseUrl, presets);
  if (preset) {
    if (!preset.supports_vision) {
      return { supportsVision: false, uncertain: false };
    }
    const matched = preset.suggested_models.find(
      (item) => item.id.toLowerCase() === normalized,
    );
    if (matched) {
      return { supportsVision: matched.supports_vision, uncertain: false };
    }
  }
  if (!normalized) {
    return {
      supportsVision: preset ? preset.supports_vision : false,
      uncertain: false,
    };
  }
  if (engine === 'volcengine' && normalized.startsWith('ep-')) {
    return { supportsVision: true, uncertain: true };
  }
  if (engine === 'deepseek') {
    if (normalized === 'deepseek-chat' || normalized === 'deepseek-reasoner') {
      return { supportsVision: false, uncertain: false };
    }
    return {
      supportsVision:
        normalized.includes('vision') || normalized.includes('vl'),
      uncertain: !normalized.includes('vision') && !normalized.includes('vl'),
    };
  }
  if (engine === 'openai') {
    if (
      OPENAI_TEXT_ONLY_PREFIXES.some((prefix) => normalized.startsWith(prefix))
    ) {
      return { supportsVision: false, uncertain: false };
    }
    return { supportsVision: true, uncertain: false };
  }
  return {
    supportsVision: !normalized.includes('deepseek-v3'),
    uncertain: true,
  };
}
