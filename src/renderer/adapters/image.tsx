import { forwardRef, type ImgHTMLAttributes } from 'react';

type ImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string | { src: string; width?: number; height?: number };
  alt: string;
  fill?: boolean;
  priority?: boolean;
  unoptimized?: boolean;
};

// Upstream disables image optimization. Preserve Next's dimensions and fill
// positioning without a Next image server or changes to the business markup.
const Image = forwardRef<HTMLImageElement, ImageProps>(function Image(
  { src, alt, fill, priority, unoptimized: _unoptimized, style, loading, width, height, ...props },
  ref,
) {
  const source = typeof src === 'string' ? src : src.src;
  return (
    <img
      {...props}
      alt={alt}
      data-nimg={fill ? 'fill' : '1'}
      decoding="async"
      loading={loading ?? (priority ? 'eager' : 'lazy')}
      ref={ref}
      src={source}
      width={fill ? undefined : (width ?? (typeof src === 'object' ? src.width : undefined))}
      height={fill ? undefined : (height ?? (typeof src === 'object' ? src.height : undefined))}
      style={{
        ...(fill
          ? {
              position: 'absolute',
              height: '100%',
              width: '100%',
              left: 0,
              top: 0,
              right: 0,
              bottom: 0,
            }
          : {}),
        color: 'transparent',
        ...style,
      }}
    />
  );
});

export default Image;
