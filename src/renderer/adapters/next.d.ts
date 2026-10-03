// Build-only type adapter for reused public-page metadata. No Next runtime is
// bundled and desktop routes do not execute RSC or metadata server requests.
declare module 'next' {
  export type Metadata = Record<string, unknown>;
}
