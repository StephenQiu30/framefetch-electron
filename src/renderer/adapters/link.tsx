import { type AnchorHTMLAttributes, forwardRef } from 'react';
import { internalUrl, plainClick, useRouter } from './navigation';

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  replace?: boolean;
  scroll?: boolean;
  prefetch?: boolean;
};

const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { href, onClick, replace = false, scroll = true, prefetch: _prefetch, ...props },
  ref,
) {
  const router = useRouter();
  return (
    <a
      {...props}
      href={href}
      ref={ref}
      onClick={(event) => {
        onClick?.(event);
        if (!plainClick(event) || props.download || (props.target && props.target !== '_self'))
          return;
        if (!internalUrl(href)) return;
        event.preventDefault();
        router[replace ? 'replace' : 'push'](href, { scroll });
      }}
    />
  );
});

export default Link;
