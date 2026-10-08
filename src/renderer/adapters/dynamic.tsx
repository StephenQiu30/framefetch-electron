import { type ComponentType, lazy, Suspense } from 'react';

// The desktop renderer is always client-side. Keep upstream loading states
// while Vite splits the same dynamic imports into local bundled chunks.
export default function dynamic<Props extends object>(
  loader: () => Promise<ComponentType<Props> | { default: ComponentType<Props> }>,
  options: { loading?: ComponentType; ssr?: boolean } = {},
): ComponentType<Props> {
  const Component = lazy(async () => {
    const loaded = await loader();
    return 'default' in loaded ? loaded : { default: loaded };
  });
  const Loading = options.loading;

  return function DynamicComponent(props: Props) {
    return (
      <Suspense fallback={Loading ? <Loading /> : null}>
        <Component {...props} />
      </Suspense>
    );
  };
}
