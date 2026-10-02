import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { contractTypes } from './contract-lib.mjs';

const root = new URL('../', import.meta.url);
const liveSchema = execFileSync(
  'uv',
  [
    'run',
    '--project',
    'engine',
    '--frozen',
    'python',
    '-c',
    'import json; from framefetch_desktop.models import EngineContract; print(json.dumps(EngineContract.model_json_schema(), indent=2))',
  ],
  { cwd: fileURLToPath(root), encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
);
const [savedSchema, savedTypes] = await Promise.all([
  readFile(new URL('contracts/engine.schema.json', root), 'utf8'),
  readFile(new URL('src/shared/generated.ts', root), 'utf8'),
]);
if (savedSchema !== liveSchema || savedTypes !== (await contractTypes(JSON.parse(liveSchema)))) {
  throw new Error(
    'Engine contract drift. Run pnpm contract:generate and review both generated files.',
  );
}
console.log('Engine schema and generated TypeScript match the Python models.');
