import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { EngineSupervisor, verifyRuntime } from '../../src/main/runtime';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
async function dir() {
  const path = await mkdtemp(join(tmpdir(), 'framefetch-supervisor-'));
  directories.push(path);
  return path;
}
it('rejects a resource hash mismatch and path traversal before launching packaged code', async () => {
  const root = await dir();
  await mkdir(join(root, 'engine'));
  const enginePath = `engine/framefetch-engine${process.platform === 'win32' ? '.exe' : ''}`;
  await writeFile(join(root, enginePath), 'engine');
  const manifest = {
    schema_version: 1,
    protocol_version: '1',
    platform: process.platform,
    arch: process.arch,
    engine_version: '0.1.0',
    files: [
      {
        path: enginePath,
        role: 'engine',
        sha256: createHash('sha256').update('engine').digest('hex'),
        size_bytes: 6,
      },
    ],
  };
  await mkdir(join(root, 'tools'));
  for (const tool of ['ffmpeg', 'ffprobe']) {
    const path = `tools/${tool}${process.platform === 'win32' ? '.exe' : ''}`;
    await writeFile(join(root, path), 'engine');
    manifest.files.push({
      path,
      role: tool,
      sha256: manifest.files[0]?.sha256 ?? '',
      size_bytes: 6,
    });
  }
  if (process.platform === 'win32') {
    await mkdir(join(root, 'native'));
    await writeFile(join(root, 'native/job.node'), 'engine');
    manifest.files.push({
      path: 'native/job.node',
      role: 'native-job',
      sha256: manifest.files[0]?.sha256 ?? '',
      size_bytes: 6,
    });
  }
  await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest));
  await expect(verifyRuntime(root)).resolves.toBeUndefined();
  await writeFile(join(root, enginePath), 'broken');
  await expect(verifyRuntime(root)).rejects.toThrow('资源');
  const engineFile = manifest.files[0];
  if (!engineFile) throw new Error('test manifest requires engine');
  engineFile.path = '../escape';
  await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest));
  await expect(verifyRuntime(root)).rejects.toThrow('路径');
});
it('recovers connection after engine crash without retrying an unconfirmed mutation', async () => {
  const root = await dir();
  const script = join(root, 'engine.cjs');
  const marker = join(root, 'once');
  await writeFile(
    script,
    `const fs=require('node:fs'); const readline=require('node:readline'); readline.createInterface({input:process.stdin}).on('line',(line)=>{const p=JSON.parse(line);if(p.method==='engine.hello'){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:p.id,result:{protocol_version:'1',engine_version:'0.1.0',schema_version:'1',capabilities:{},resources:{}}})+'\\n');}else if(p.method==='analysis.create'){fs.writeFileSync(${JSON.stringify(marker)},'sent');process.exit(7);}else if(p.method==='engine.shutdown'){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:p.id,result:null})+'\\n');process.exit(0);}});`,
  );
  const supervisor = new EngineSupervisor({
    command: process.execPath,
    args: [script],
    dataDir: root,
    libraryDir: root,
    resourceDir: root,
    restartDelay: 10,
    handshakeMs: 1000,
    job: { create: () => ({}), close: () => {} },
  });
  await supervisor.start();
  expect(supervisor.state.state).toBe('ready');
  await expect(supervisor.request('analysis.create', {})).rejects.toThrow('退出');
  await new Promise<void>((resolve) => {
    const listener = () => {
      if (supervisor.state.state === 'ready') {
        supervisor.off('state', listener);
        resolve();
      }
    };
    supervisor.on('state', listener);
  });
  expect(supervisor.state.state).toBe('ready');
  await supervisor.stop(1000);
  expect(supervisor.state.state).toBe('stopped');
});
it('bounds a missing hello and a hung shutdown instead of keeping subprocesses alive', async () => {
  const root = await dir();
  const script = join(root, 'hung.cjs');
  await writeFile(script, `process.on('SIGTERM',()=>{}); setInterval(()=>{},1000);`);
  const supervisor = new EngineSupervisor({
    command: process.execPath,
    args: [script],
    dataDir: root,
    libraryDir: root,
    resourceDir: root,
    handshakeMs: 30,
    autoRestart: false,
    job: { create: () => ({}), close: () => {} },
  });
  await expect(supervisor.start()).rejects.toThrow('确认');
  await supervisor.stop(30);
  expect(supervisor.state.state).toBe('stopped');
}, 3000);
it.skipIf(process.platform === 'win32')(
  'reclaims a live grandchild process group after its engine leader crashes',
  async () => {
    const root = await dir();
    const script = join(root, 'tree.cjs');
    const marker = join(root, 'child.pid');
    await writeFile(
      script,
      `const fs=require('node:fs'); const cp=require('node:child_process'); const rl=require('node:readline'); const sub=cp.spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'}); fs.writeFileSync(${JSON.stringify(marker)},String(sub.pid)); rl.createInterface({input:process.stdin}).on('line',l=>{const p=JSON.parse(l); if(p.method==='engine.hello')process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:p.id,result:{protocol_version:'1',schema_version:'1'}})+'\\n');else process.exit(7);});`,
    );
    const supervisor = new EngineSupervisor({
      command: process.execPath,
      args: [script],
      dataDir: root,
      libraryDir: root,
      resourceDir: root,
      autoRestart: false,
    });
    await supervisor.start();
    const pid = Number(await readFile(marker, 'utf8'));
    expect(() => process.kill(pid, 0)).not.toThrow();
    await expect(supervisor.request('tasks.list', {})).rejects.toThrow('退出');
    const deadline = Date.now() + 1500;
    let alive = true;
    while (alive && Date.now() < deadline) {
      try {
        process.kill(pid, 0);
        await new Promise((done) => setTimeout(done, 10));
      } catch {
        alive = false;
      }
    }
    await supervisor.stop(50);
    expect(alive).toBe(false);
  },
  3000,
);
