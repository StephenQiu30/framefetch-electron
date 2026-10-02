import { compile } from 'json-schema-to-typescript';

export function contractTypes(schema) {
  return compile(schema, 'EngineContract', {
    additionalProperties: false,
    bannerComment:
      '/* Generated from the Python engine JSON Schema. Run pnpm contract:generate. */',
    style: { singleQuote: true, semi: true, tabWidth: 2, printWidth: 100 },
  });
}
