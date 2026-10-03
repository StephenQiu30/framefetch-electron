import { describe, expect, it } from 'vitest';
import {
  backendUrl,
  DEFAULT_BACKEND_URL,
  isAppNavigation,
  isExternalLink,
  resolveBackendUrl,
} from '../../src/main/connection';

describe('backend connection boundary', () => {
  it.each([
    ['https://api.example.com', 'https://api.example.com/'],
    [' https://api.example.com:443/ ', 'https://api.example.com/'],
    ['http://localhost:8111', 'http://localhost:8111/'],
    ['http://127.0.0.1:8111/', 'http://127.0.0.1:8111/'],
    ['http://[::1]:8111/', 'http://[::1]:8111/'],
  ])('normalizes configured service root %s', (input, expected) => {
    expect(backendUrl(input)).toBe(expected);
  });

  it.each([
    '',
    'invalid',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'http://api.example.com/',
    'https://username:password@api.example.com/',
    'https://api.example.com/api/',
    'https://api.example.com/?token=secret',
    'https://api.example.com/#fragment',
    'https://api.example.com/'.padEnd(2049, 'x'),
  ])('rejects unsafe or ambiguous service root %j', (input) => {
    expect(() => backendUrl(input)).toThrow();
  });

  it('uses CLI, environment, saved configuration and default in that order', () => {
    expect(
      resolveBackendUrl(
        ['--backend-url=https://cli.example.com/'],
        'https://saved.example.com/',
        'https://environment.example.com/',
      ),
    ).toBe('https://cli.example.com/');
    expect(
      resolveBackendUrl([], 'https://saved.example.com/', 'https://environment.example.com/'),
    ).toBe('https://environment.example.com/');
    expect(resolveBackendUrl([], 'https://saved.example.com/')).toBe('https://saved.example.com/');
    expect(resolveBackendUrl([])).toBe(DEFAULT_BACKEND_URL);
  });

  it('does not silently fall back from an invalid explicitly selected origin', () => {
    expect(() => resolveBackendUrl(['--backend-url='], 'https://saved.example.com/')).toThrow();
    expect(() => resolveBackendUrl([], 'https://saved.example.com/', '')).toThrow();
    expect(() =>
      resolveBackendUrl([
        '--backend-url=https://first.example.com/',
        '--backend-url=https://second.example.com/',
      ]),
    ).toThrow();
  });

  it('allows service routes and query strings while retaining exact origin identity', () => {
    const root = 'https://api.example.com/';
    expect(isAppNavigation('https://api.example.com/user/login?next=%2Fhistory#login', root)).toBe(
      true,
    );
    for (const target of [
      'https://api.example.com.evil.test/',
      'https://api.example.com:8443/',
      'http://api.example.com/',
      'https://user@api.example.com/',
      'file:///etc/passwd',
      'javascript:alert(1)',
      '/relative',
    ])
      expect(isAppNavigation(target, root)).toBe(false);
  });

  it('allows external HTTPS links without credentials', () => {
    expect(isExternalLink('https://github.com/StephenQiu30/video-electron')).toBe(true);
    for (const target of [
      'http://example.com/',
      'https://user:password@example.com/',
      'file:///tmp/file',
      'javascript:alert(1)',
      'relative',
    ])
      expect(isExternalLink(target)).toBe(false);
  });
});
