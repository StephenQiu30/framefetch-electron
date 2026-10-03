export const DEFAULT_BACKEND_URL = 'http://127.0.0.1:8111/';

export function backendUrl(value: string): string {
  if (!value || value.length > 2048) throw new Error('Backend 地址无效');
  const url = new URL(value.trim());
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new Error('请填写不带凭据、参数和路径的 Backend HTTP(S) 根地址');
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    throw new Error('远端 Backend 必须使用 HTTPS，本机可使用 loopback HTTP');
  return url.href;
}

export function resolveBackendUrl(
  argv: readonly string[],
  saved?: string,
  environment?: string,
): string {
  const arguments_ = argv.filter((argument) => argument.startsWith('--backend-url='));
  if (arguments_.length > 1) throw new Error('只能指定一个 Backend 地址');
  const cli = arguments_[0]?.slice('--backend-url='.length);
  return backendUrl(cli ?? environment ?? saved ?? DEFAULT_BACKEND_URL);
}

export function isAppNavigation(target: string, configured: string): boolean {
  try {
    const url = new URL(target);
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      url.origin === new URL(configured).origin
    );
  } catch {
    return false;
  }
}

export function isExternalLink(target: string): boolean {
  try {
    const url = new URL(target);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}
