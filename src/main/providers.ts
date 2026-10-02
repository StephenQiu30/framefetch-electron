import { randomUUID } from 'node:crypto';
import type { AnalysisRequest } from '../shared/api';
import type { Provider, Task } from '../shared/generated';
import type { CredentialVault } from './credentials';
import { canonicalEndpoint, id, validateAnalysis, validateProvider } from './validation';

interface EngineClient {
  request<T = unknown>(method: string, params: unknown): Promise<T>;
}
export class ProviderService {
  private operations: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly engine: EngineClient,
    private readonly vault: CredentialVault,
  ) {}
  private serialized<T>(run: () => Promise<T>): Promise<T> {
    const operation = this.operations.then(run);
    this.operations = operation.catch(() => {});
    return operation;
  }
  list(): Promise<Provider[]> {
    return this.serialized(async () => {
      const list = await this.engine.request<Provider[]>('providers.list', {});
      return Promise.all(
        list.map(async (provider) => ({
          ...provider,
          key_set: await this.vault.has(provider.id, provider.base_url),
        })),
      );
    });
  }
  save(value: unknown): Promise<{ provider: Provider; storage: 'encrypted' | 'session' | null }> {
    const input = validateProvider(value);
    return this.serialized(async () => {
      const { api_key: key, ...config } = input;
      const providerId = config.id ?? randomUUID();
      const existing = (await this.engine.request<Provider[]>('providers.list', {})).find(
        (provider) => provider.id === providerId,
      );
      if (existing && canonicalEndpoint(existing.base_url) !== config.base_url && key === undefined)
        throw new Error('模型接口地址已变化，请重新输入 API Key 后保存');
      const provider = await this.engine.request<Provider>('providers.upsert', {
        ...config,
        id: providerId,
      });
      const endpoint = canonicalEndpoint(provider.base_url);
      if (endpoint !== config.base_url)
        throw new Error('模型接口保存结果与请求不一致，请重新输入 API Key');
      const storage = key === undefined ? null : await this.vault.store(provider.id, endpoint, key);
      return {
        provider: { ...provider, key_set: await this.vault.has(provider.id, endpoint) },
        storage,
      };
    });
  }
  remove(providerId: string): Promise<void> {
    const name = id(providerId);
    return this.serialized(async () => {
      await this.engine.request('providers.delete', { provider_id: name });
      await this.vault.remove(name);
    });
  }
  analyze(value: AnalysisRequest): Promise<Task> {
    const input = validateAnalysis(value);
    return this.serialized(async () => {
      const provider = (await this.engine.request<Provider[]>('providers.list', {})).find(
        (provider) => provider.id === input.provider_id,
      );
      if (!provider) throw new Error('模型服务已不存在，请重新选择');
      const key = await this.vault.forAnalysis(provider.id, provider.base_url);
      if (!key) throw new Error('请先为模型保存 API Key');
      return this.engine.request<Task>('analysis.create', {
        ...input,
        api_key: key,
        expected_provider_base_url: canonicalEndpoint(provider.base_url),
        operation_id: randomUUID(),
      });
    });
  }
}
