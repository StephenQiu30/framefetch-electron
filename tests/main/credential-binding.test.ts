import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { CredentialVault } from '../../src/main/credentials';
import { ProviderService } from '../../src/main/providers';
import type { Provider } from '../../src/shared/generated';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function setup(available = true) {
  const root = await mkdtemp(join(tmpdir(), 'framefetch-key-binding-'));
  roots.push(root);
  const backend = {
    available,
    fail: false,
    rotate: false,
    encryptStringAsync: vi.fn(async (value: string) => {
      if (backend.fail) throw new Error('injected storage failure');
      return Buffer.from(`sealed:${Buffer.from(value).toString('base64')}`);
    }),
    isAsyncEncryptionAvailable: async () => backend.available,
    decryptStringAsync: vi.fn(async (buffer: Buffer) => ({
      result: Buffer.from(buffer.toString().slice('sealed:'.length), 'base64').toString(),
      shouldReEncrypt: backend.rotate,
    })),
  };
  const vault = new CredentialVault(root, backend);
  return { root, vault, backend };
}
const endpointA = 'https://provider.example/v1';
const endpointB = 'https://other.example/v1';
const config = {
  id: 'provider',
  label: 'Provider',
  base_url: endpointA,
  model: 'example',
  vision: true,
};
const analysis = { asset_id: 'asset', provider_id: 'provider', skill: 'comprehensive' as const };
function engine() {
  let current: Provider | null = null;
  const dispatches: Record<string, unknown>[] = [];
  const client = {
    failUpsert: false,
    failAfterUpsert: false,
    dispatchStarted: false,
    dispatchWait: null as Promise<void> | null,
    timeOutAnalysis: false,
    rejectedDeferred: 0,
    analysisExpected: undefined as unknown,
    request: async <T>(method: string, params: unknown): Promise<T> => {
      if (method === 'providers.list') return (current ? [current] : []) as T;
      if (method === 'providers.upsert') {
        if (client.failUpsert) throw new Error('injected upsert failure');
        current = { ...(params as Provider), key_set: false };
        if (client.failAfterUpsert) throw new Error('injected lost upsert response');
        return current as T;
      }
      if (method === 'analysis.create') {
        client.dispatchStarted = true;
        const request = params as Record<string, unknown>;
        client.analysisExpected = request.expected_provider_base_url;
        if (client.timeOutAnalysis) {
          void (async () => {
            if (client.dispatchWait) await client.dispatchWait;
            if (request.expected_provider_base_url !== current?.base_url) client.rejectedDeferred++;
            else dispatches.push({ ...request, endpoint: current?.base_url });
          })();
          throw new Error('injected RPC timeout: operation unconfirmed');
        }
        if (client.dispatchWait) await client.dispatchWait;
        if (request.expected_provider_base_url !== current?.base_url)
          throw new Error('provider_endpoint_changed');
        dispatches.push({ ...(params as Record<string, unknown>), endpoint: current?.base_url });
        return { id: 'task' } as T;
      }
      throw new Error(`Unexpected command ${method}`);
    },
  };
  return { client, dispatches, current: () => current };
}
it('binds session keys to the complete canonical endpoint, including path', async () => {
  const { vault } = await setup(false);
  await vault.store('provider', endpointA, 'synthetic-A');
  expect(await vault.forAnalysis('provider', 'https://PROVIDER.example:443/v1/')).toBe(
    'synthetic-A',
  );
  await expect(vault.forAnalysis('provider', endpointB)).rejects.toThrow('接口');
  await expect(vault.forAnalysis('provider', `${endpointA}/other`)).rejects.toThrow('接口');
  expect(await vault.has('provider', endpointB)).toBe(false);
});
it('rejects legacy unbound ciphertext and keeps rotation bound to the saved endpoint', async () => {
  const { root, vault, backend } = await setup();
  await vault.store('provider', endpointA, 'synthetic-A');
  backend.rotate = true;
  expect(await vault.forAnalysis('provider', endpointA)).toBe('synthetic-A');
  expect(backend.encryptStringAsync).toHaveBeenCalledTimes(2);
  expect(JSON.parse(backend.encryptStringAsync.mock.calls[1]?.[0] ?? '{}')).toEqual({
    version: 1,
    endpoint: endpointA,
    key: 'synthetic-A',
  });
  expect((await readFile(join(root, 'provider.bin'))).toString()).not.toContain('synthetic-A');
  await writeFile(
    join(root, 'legacy.bin'),
    Buffer.from(`sealed:${Buffer.from('legacy-synthetic-key').toString('base64')}`),
  );
  expect(await vault.has('legacy', endpointA)).toBe(false);
  await expect(vault.forAnalysis('legacy', endpointA)).rejects.toThrow('重新输入');
});
it('refuses endpoint edits without a replacement key, while permitting metadata edits', async () => {
  const { vault } = await setup();
  const remote = engine();
  const service = new ProviderService(remote.client, vault);
  await service.save({ ...config, api_key: 'synthetic-A' });
  await expect(service.save({ ...config, base_url: endpointB })).rejects.toThrow('重新输入');
  expect(remote.current()?.base_url).toBe(endpointA);
  await service.save({ ...config, label: 'Renamed' });
  await service.analyze(analysis);
  expect(remote.dispatches).toEqual([
    expect.objectContaining({ api_key: 'synthetic-A', endpoint: endpointA }),
  ]);
});
it('cannot dispatch an old key to a new endpoint after an encryption or upsert failure', async () => {
  const { vault, backend } = await setup();
  const remote = engine();
  const service = new ProviderService(remote.client, vault);
  await service.save({ ...config, api_key: 'synthetic-A' });
  backend.fail = true;
  await expect(
    service.save({ ...config, base_url: endpointB, api_key: 'synthetic-B' }),
  ).rejects.toThrow();
  expect(remote.current()?.base_url).toBe(endpointB);
  expect((await service.list())[0]?.key_set).toBe(false);
  await expect(service.analyze(analysis)).rejects.toThrow('接口');
  expect(remote.dispatches).toHaveLength(0);
  backend.fail = false;
  await service.save({ ...config, api_key: 'synthetic-A' });
  remote.client.failUpsert = true;
  await expect(
    service.save({ ...config, base_url: endpointB, api_key: 'synthetic-B' }),
  ).rejects.toThrow();
  await service.analyze(analysis);
  expect(remote.dispatches).toEqual([
    expect.objectContaining({ api_key: 'synthetic-A', endpoint: endpointA }),
  ]);
});
it('serializes key storage and analysis dispatch across concurrent provider edits', async () => {
  const { vault, backend } = await setup();
  const remote = engine();
  const service = new ProviderService(remote.client, vault);
  await service.save({ ...config, api_key: 'synthetic-A' });
  let release = () => {};
  const gate = new Promise<void>((done) => {
    release = done;
  });
  const encrypt = backend.encryptStringAsync.getMockImplementation();
  if (!encrypt) throw new Error('test encryptor missing');
  backend.encryptStringAsync.mockImplementationOnce(async (value) => {
    await gate;
    return encrypt(value);
  });
  const saving = service.save({ ...config, base_url: endpointB, api_key: 'synthetic-B' });
  const dispatching = service.analyze(analysis);
  await new Promise((done) => setTimeout(done, 5));
  expect(remote.dispatches).toHaveLength(0);
  release();
  await saving;
  await dispatching;
  expect(remote.dispatches).toEqual([
    expect.objectContaining({ api_key: 'synthetic-B', endpoint: endpointB }),
  ]);
});
it('holds provider edits until the engine has persisted the analysis snapshot', async () => {
  const { vault } = await setup();
  const remote = engine();
  const service = new ProviderService(remote.client, vault);
  await service.save({ ...config, api_key: 'synthetic-A' });
  let release = () => {};
  remote.client.dispatchWait = new Promise<void>((done) => {
    release = done;
  });
  const dispatching = service.analyze(analysis);
  while (!remote.client.dispatchStarted) await new Promise((done) => setTimeout(done, 1));
  const saving = service.save({ ...config, base_url: endpointB, api_key: 'synthetic-B' });
  await new Promise((done) => setTimeout(done, 5));
  expect(remote.current()?.base_url).toBe(endpointA);
  release();
  await dispatching;
  await saving;
  expect(remote.dispatches).toEqual([
    expect.objectContaining({ api_key: 'synthetic-A', endpoint: endpointA }),
  ]);
  expect(remote.current()?.base_url).toBe(endpointB);
});
it('rejects the old binding after an upsert response is lost but the endpoint did change', async () => {
  const { vault } = await setup();
  const remote = engine();
  const service = new ProviderService(remote.client, vault);
  await service.save({ ...config, api_key: 'synthetic-A' });
  remote.client.failAfterUpsert = true;
  await expect(
    service.save({ ...config, base_url: endpointB, api_key: 'synthetic-B' }),
  ).rejects.toThrow();
  await expect(service.analyze(analysis)).rejects.toThrow('接口');
  expect(remote.dispatches).toHaveLength(0);
});
it('binds unconfirmed timed-out analysis creation to its original endpoint', async () => {
  const { vault } = await setup();
  const remote = engine();
  const service = new ProviderService(remote.client, vault);
  await service.save({ ...config, api_key: 'synthetic-A' });
  let release = () => {};
  remote.client.dispatchWait = new Promise<void>((done) => {
    release = done;
  });
  remote.client.timeOutAnalysis = true;
  await expect(service.analyze(analysis)).rejects.toThrow('unconfirmed');
  expect(remote.client.analysisExpected).toBe(endpointA);
  await service.save({ ...config, base_url: endpointB, api_key: 'synthetic-B' });
  release();
  await new Promise((done) => setTimeout(done, 1));
  expect(remote.client.rejectedDeferred).toBe(1);
  expect(remote.dispatches).toHaveLength(0);
});
