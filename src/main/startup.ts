import { isAbsolute, resolve } from 'node:path';

export function profileDirectory(argv: readonly string[]): string | null {
  const matches = argv.filter((argument) => argument.startsWith('--user-data-dir='));
  if (!matches.length) return null;
  if (matches.length !== 1) throw new Error('只能指定一个应用数据目录');
  const path = matches[0]?.slice('--user-data-dir='.length) ?? '';
  if (!path || path.length > 32768 || path.includes('\0') || !isAbsolute(path))
    throw new Error('应用数据目录必须是完整绝对路径');
  return resolve(path);
}
