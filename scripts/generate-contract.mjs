import { readFile, writeFile } from 'node:fs/promises';
import { contractTypes } from './contract-lib.mjs';

const root = new URL('../', import.meta.url);
const schema = JSON.parse(await readFile(new URL('contracts/engine.schema.json', root), 'utf8'));
const source = await contractTypes(schema);
await writeFile(new URL('src/shared/generated.ts', root), source);
