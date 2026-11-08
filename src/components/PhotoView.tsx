import type { ReactNode } from 'react';
import { objectUrlFor } from '../lib/objectUrl.ts';

/** Shows the picked file (browser applies EXIF orientation) with an overlay sized to it. */
export function PhotoView({
  file,
  src,
  children,
  alt = '',
  height = 'max-h-[62vh] lg:max-h-[74vh]',
}: {
  file?: File | null;
  src?: string;
  children?: ReactNode;
  alt?: string;
  /** Height cap classes for the photo. */
  height?: string;
}) {
  const url = src ?? (file ? objectUrlFor(file) : null);
  if (!url) return null;
  return (
    <div className="relative mx-auto w-fit max-w-full">
      <img src={url} alt={alt} className={`block max-w-full object-contain ${height}`} draggable={false} />
      <div className="pointer-events-none absolute inset-0">{children}</div>
    </div>
  );
}

/** A photo in a measuring frame: rulers on two sides, a thin border, a dark mat. */
export function PhotoFrame({
  children,
  mode = 'target',
  className = '',
}: {
  children: ReactNode;
  mode?: 'target' | 'draw' | 'none';
  className?: string;
}) {
  return (
    <div className={`rulers ${className}`}>
      <div
        {...(mode === 'none' ? {} : { 'data-photo': mode === 'draw' ? 'draw' : '' })}
        className="relative border border-edge bg-deep p-0"
      >
        {children}
      </div>
    </div>
  );
}
