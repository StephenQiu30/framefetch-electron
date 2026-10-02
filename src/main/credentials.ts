import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalEndpoint, id, record, text } from './validation';

export interface EncryptionBackend {
  isAsyncEncryptionAvailable(): Promise<boolean>;
  encryptStringAsync(plainText: string): Promise<Buffer>;
  decryptStringAsync(encrypted: Buffer): Promise<{ result: string; shouldReEncrypt: boolean }>;
}
interface BoundCredential {
  version: 1;
  endpoint: string;
  key: string;
}
export class CredentialVault {
  private readonly memory = new Map<string, BoundCredential>();
  private operations: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly directory: string,
    private readonly backend: EncryptionBackend,
  ) {}
  private serialized<T>(run: () => Promise<T>): Promise<T> {
    const operation = this.operations.then(run);
    this.operations = operation.catch(() => {});
    return operation;
  }
  store(providerId: string, endpoint: string, key: string): Promise<'encrypted' | 'session'> {
    const name = id(providerId);
    const payload: BoundCredential = {
      version: 1,
      endpoint: canonicalEndpoint(endpoint),
      key: text(key, 8192),
    };
    return this.serialized(() => this.persist(name, payload));
  }
  private async persist(name: string, payload: BoundCredential): Promise<'encrypted' | 'session'> {
    const path = join(this.directory, `${name}.bin`);
    if (!(await this.backend.isAsyncEncryptionAvailable())) {
      await rm(path, { force: true });
      this.memory.set(name, payload);
      return 'session';
    }
    const encrypted = await this.backend.encryptStringAsync(JSON.stringify(payload));
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const temp = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, encrypted, { mode: 0o600, flag: 'wx' });
      await rename(temp, path);
    } finally {
      await rm(temp, { force: true });
    }
    this.memory.delete(name);
    return 'encrypted';
  }
  private async readBound(name: string, rotate: boolean): Promise<BoundCredential | null> {
    const session = this.memory.get(name);
    if (session) return session;
    let encrypted: Buffer;
    try {
      encrypted = await readFile(join(this.directory, `${name}.bin`));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw new Error('凭据存储无法读取');
    }
    if (!(await this.backend.isAsyncEncryptionAvailable()))
      throw new Error('系统密钥存储暂时不可用，请重新输入 API Key');
    let decrypted: { result: string; shouldReEncrypt: boolean };
    try {
      decrypted = await this.backend.decryptStringAsync(encrypted);
    } catch {
      throw new Error('系统无法解密 API Key，请重新输入');
    }
    let payload: BoundCredential;
    try {
      const value = record(JSON.parse(decrypted.result), ['version', 'endpoint', 'key']);
      if (value.version !== 1) throw new Error();
      payload = {
        version: 1,
        endpoint: canonicalEndpoint(value.endpoint),
        key: text(value.key, 8192),
      };
    } catch {
      throw new Error('旧版或损坏的凭据没有有效接口绑定，请重新输入 API Key');
    }
    if (rotate && decrypted.shouldReEncrypt) await this.persist(name, payload);
    return payload;
  }
  // Main checks the current provider endpoint under its provider lock before dispatch.
  forAnalysis(providerId: string, endpoint: string): Promise<string | null> {
    const name = id(providerId);
    const target = canonicalEndpoint(endpoint);
    return this.serialized(async () => {
      const payload = await this.readBound(name, true);
      if (!payload) return null;
      if (payload.endpoint !== target) throw new Error('API Key 与当前模型接口不匹配，请重新输入');
      return payload.key;
    });
  }
  remove(providerId: string): Promise<void> {
    const name = id(providerId);
    return this.serialized(async () => {
      await rm(join(this.directory, `${name}.bin`), { force: true });
      this.memory.delete(name);
    });
  }
  has(providerId: string, endpoint: string): Promise<boolean> {
    const name = id(providerId);
    const target = canonicalEndpoint(endpoint);
    return this.serialized(async () => {
      try {
        return (await this.readBound(name, false))?.endpoint === target;
      } catch {
        return false;
      }
    });
  }
  clearSession(): void {
    this.memory.clear();
  }
}
