import { constants } from 'node:fs';
import {
  type FileHandle,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

interface Grant {
  path: string;
  dev: number;
  ino: number;
}
export function within(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return (
    rel === '' ||
    (!isAbsolute(rel) &&
      rel !== '..' &&
      !rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`))
  );
}
export class FileAuthority {
  private grants = new Map<string, Grant>();
  private root = '';
  private writes: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly libraryDir: string,
    private readonly grantsFile: string,
  ) {}
  async load(): Promise<void> {
    await mkdir(this.libraryDir, { recursive: true });
    this.root = await realpath(this.libraryDir);
    try {
      const value: unknown = JSON.parse(await readFile(this.grantsFile, 'utf8'));
      if (Array.isArray(value))
        for (const grant of value)
          if (
            grant &&
            typeof grant.path === 'string' &&
            Number.isFinite(grant.dev) &&
            Number.isFinite(grant.ino)
          )
            this.grants.set(grant.path, grant as Grant);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new Error('本地文件授权记录损坏');
    }
  }
  grant(paths: readonly string[]): Promise<string[]> {
    const operation = this.writes.then(() => this.persistGrant(paths));
    this.writes = operation.catch(() => {});
    return operation;
  }
  private async persistGrant(paths: readonly string[]): Promise<string[]> {
    const authorized: string[] = [];
    for (const path of paths) {
      if (!isAbsolute(path) || path.includes('\0')) throw new Error('文件路径无效');
      const canonical = await realpath(path);
      const info = await stat(canonical);
      if (!info.isFile()) throw new Error('只能导入普通文件');
      this.grants.set(canonical, { path: canonical, dev: info.dev, ino: info.ino });
      authorized.push(canonical);
    }
    await mkdir(dirname(this.grantsFile), { recursive: true, mode: 0o700 });
    const temp = `${this.grantsFile}.tmp`;
    await writeFile(temp, JSON.stringify([...this.grants.values()]), { mode: 0o600 });
    await rename(temp, this.grantsFile);
    return authorized;
  }
  async open(path: string): Promise<FileHandle> {
    if (!isAbsolute(path) || path.includes('\0')) throw new Error('文件路径未授权');
    const requested = resolve(path);
    const canonical = await realpath(requested);
    const grant = this.grants.get(canonical);
    const managed =
      within(this.root, canonical) &&
      (within(this.root, requested) || within(resolve(this.libraryDir), requested));
    if (!managed && !grant) throw new Error('文件路径未授权');
    const handle = await open(
      canonical,
      constants.O_RDONLY | (process.platform === 'win32' ? 0 : constants.O_NOFOLLOW),
    );
    try {
      const info = await handle.stat();
      const current = await stat(canonical);
      if (
        !info.isFile() ||
        info.dev !== current.dev ||
        info.ino !== current.ino ||
        (!managed && (grant?.dev !== info.dev || grant.ino !== info.ino))
      )
        throw new Error('文件授权已失效，请重新选择文件');
      if ((await realpath(requested)) !== canonical) throw new Error('文件路径已变化');
      return handle;
    } catch (error) {
      await handle.close();
      throw error;
    }
  }
  async authorizedPath(path: string): Promise<string> {
    const handle = await this.open(path);
    try {
      return await realpath(path);
    } finally {
      await handle.close();
    }
  }
}
