import { useMemo, useSyncExternalStore } from 'react';
import { markNavigationPush } from '@/components/layout/navigation-state';

const NAVIGATION_EVENT = 'framefetch:location-changed';
let installed = false;

// Next also observes native History writes. Keep pathname/search semantics for
// the unchanged filter, login redirect and navigation history components.
export function installNavigationAdapter(): void {
  if (installed) return;
  installed = true;
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = window.history[method].bind(window.history);
    window.history[method] = (data: unknown, unused: string, url?: string | URL | null) => {
      const before = currentLocation();
      original(data, unused, url);
      if (before !== currentLocation()) window.dispatchEvent(new Event(NAVIGATION_EVENT));
    };
  }
  const notify = () => window.dispatchEvent(new Event(NAVIGATION_EVENT));
  window.addEventListener('popstate', notify);
  window.addEventListener('hashchange', notify);
  document.addEventListener('click', (event) => {
    if (!plainClick(event)) return;
    const anchor =
      event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
    if (!anchor || anchor.download || (anchor.target && anchor.target !== '_self')) return;
    const url = internalUrl(anchor.href);
    if (!url) {
      const external = new URL(anchor.href);
      if (external.protocol === 'https:' && !external.username && !external.password) {
        event.preventDefault();
        window.open(external.href, '_blank', 'noopener');
      }
      return;
    }
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/health/')) return;
    event.preventDefault();
    navigate(url.href, false, true);
  });
}

export function plainClick(
  event: Pick<
    MouseEvent,
    'defaultPrevented' | 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'
  >,
): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

export function internalUrl(href: string): URL | null {
  try {
    const url = new URL(href, window.location.href);
    return url.origin === window.location.origin && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

function currentLocation(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(NAVIGATION_EVENT, onChange);
  return () => window.removeEventListener(NAVIGATION_EVENT, onChange);
}

export function useLocation(): string {
  return useSyncExternalStore(subscribe, currentLocation, () => '/');
}

function navigate(href: string, replace: boolean, scroll = true): void {
  const url = internalUrl(href);
  if (!url) throw new TypeError('Only application routes can be opened by the desktop router.');
  if (!replace) markNavigationPush(url.href);
  window.history[replace ? 'replaceState' : 'pushState'](null, '', url);
  if (scroll) {
    requestAnimationFrame(() => {
      if (url.hash) {
        const id = decodeURIComponent(url.hash.slice(1));
        document.getElementById(id)?.scrollIntoView();
      } else window.scrollTo(0, 0);
    });
  }
}

const router = {
  push: (href: string, options?: { scroll?: boolean }) =>
    navigate(href, false, options?.scroll ?? true),
  replace: (href: string, options?: { scroll?: boolean }) =>
    navigate(href, true, options?.scroll ?? true),
  back: () => window.history.back(),
  forward: () => window.history.forward(),
  // There is no server component tree to refresh; existing providers own data.
  refresh: () => window.dispatchEvent(new Event(NAVIGATION_EVENT)),
  prefetch: (_href: string) => undefined,
};

export function useRouter(): typeof router {
  return router;
}

export function usePathname(): string {
  useLocation();
  return window.location.pathname;
}

export function useSearchParams(): URLSearchParams {
  const location = useLocation();
  return useMemo(() => new URL(location, window.location.origin).searchParams, [location]);
}
