import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { profileDirectory } from '../../src/main/startup';

describe('isolated Electron profiles', () => {
  it('leaves the normal application profile selected when no override exists', () => {
    expect(profileDirectory(['electron', '.'])).toBeNull();
  });

  it('resolves an absolute directory without changing the process working directory', () => {
    const selected = resolve(tmpdir(), 'framefetch profile', '..', 'isolated profile');
    expect(profileDirectory(['electron', '.', `--user-data-dir=${selected}`])).toBe(selected);
  });

  it.each(['', 'relative/profile', 'a\0b', 'x'.repeat(32769)])(
    'rejects invalid profile override %j',
    (path) => {
      expect(() => profileDirectory([`--user-data-dir=${path}`])).toThrow();
    },
  );

  it('rejects ambiguous duplicate overrides', () => {
    const selected = resolve(tmpdir(), 'framefetch-test');
    expect(() =>
      profileDirectory([`--user-data-dir=${selected}`, `--user-data-dir=${selected}`]),
    ).toThrow();
  });
});
