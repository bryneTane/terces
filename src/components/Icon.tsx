// Line icons on a 24 px grid, drawn with the current text colour.
import { useId } from 'react';
import { SYMBOL, WORDMARK, WORDMARK_STROKES, cutsPath, polylinePath, symbolPath } from '../styles/mark.ts';
const PATHS = {
  pin: 'M12 21s-6.5-5.7-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 15.3 12 21 12 21zM12 7.4a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 1 0 0-4.8z',
  clock: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 1 0 0-17zM12 7.5V12l3 2',
  phone:
    'M8.7 2.5h6.6a2.2 2.2 0 0 1 2.2 2.2v14.6a2.2 2.2 0 0 1-2.2 2.2H8.7a2.2 2.2 0 0 1-2.2-2.2V4.7a2.2 2.2 0 0 1 2.2-2.2zM10.5 18.5h3',
  camera: 'M3.5 8h3.5l1.8-2.5h6.4L17 8h3.5v11h-17zM12 9.8a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 1 0 0-6.8z',
  id: 'M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM9 8.8a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 1 0 0-4.4zM5.8 16.2c.6-1.6 1.8-2.4 3.2-2.4s2.6.8 3.2 2.4M14.5 10h4M14.5 13.5h3',
  chip: 'M8 6.5h8a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 16V8A1.5 1.5 0 0 1 8 6.5zM9.5 3v3.5M14.5 3v3.5M9.5 17.5V21M14.5 17.5V21M3 9.5h3.5M3 14.5h3.5M17.5 9.5H21M17.5 14.5H21',
  face: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 1 0 0-17zM9.2 10.2h.01M14.8 10.2h.01M8.8 14.6c.9 1.1 2 1.7 3.2 1.7s2.3-.6 3.2-1.7',
  text: 'M5 7V4.8h14V7M12 4.8v14.4M9 19.2h6',
  plate:
    'M4.1 7h15.8a1.6 1.6 0 0 1 1.6 1.6v6.8a1.6 1.6 0 0 1-1.6 1.6H4.1a1.6 1.6 0 0 1-1.6-1.6V8.6A1.6 1.6 0 0 1 4.1 7zM6.5 12h2.5M11 12h2M15 12h2.5',
  person: 'M12 3.9a3.3 3.3 0 1 0 0 6.6 3.3 3.3 0 1 0 0-6.6zM5.5 20.5c.6-4.1 3.1-6.4 6.5-6.4s5.9 2.3 6.5 6.4',
  draw: 'M4 4h4M4 4v4M20 4h-4M20 4v4M4 20h4M4 20v-4M20 20h-4M20 20v-4M12 9v6M9 12h6',
  pointer: 'M5.5 3.5 18 10l-5.6 1.9L10.5 17.5z',
  undo: 'M9 14.5 4.5 10 9 5.5M4.5 10H14a5.5 5.5 0 0 1 0 11h-3',
  upload: 'M12 15.5V4.5M7.5 9 12 4.5 16.5 9M4.5 15v4.5h15V15',
  download: 'M12 4.5v11M7.5 11 12 15.5 16.5 11M4.5 19.5h15',
  share:
    'M6.5 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5zM17.5 3.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5zM17.5 15.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5zM8.7 10.8l6.6-3.6M8.7 13.2l6.6 3.6',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  back: 'M19 12H5M11 6l-6 6 6 6',
  restart: 'M4.5 12a7.5 7.5 0 1 0 2.3-5.4M4.5 4.5v4h4',
  edit: 'M4.5 19.5l1-4.2L16 4.8l3.2 3.2L8.7 18.5zM14 6.8l3.2 3.2',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  close: 'M6 6l12 12M18 6 6 18',
  shield: 'M12 3l7.5 3v5.6c0 4.6-3.1 8.2-7.5 9.6-4.4-1.4-7.5-5-7.5-9.6V6z',
  shieldCheck: 'M12 3l7.5 3v5.6c0 4.6-3.1 8.2-7.5 9.6-4.4-1.4-7.5-5-7.5-9.6V6zM8.6 12.2l2.4 2.4 4.5-4.6',
  lock: 'M6.8 10.5h10.4a1.8 1.8 0 0 1 1.8 1.8v6.4a1.8 1.8 0 0 1-1.8 1.8H6.8A1.8 1.8 0 0 1 5 18.7v-6.4a1.8 1.8 0 0 1 1.8-1.8zM8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5',
  eye: 'M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12zM12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 1 0 0-5.6z',
  mask: 'M4 5h16v14H4zM4 5l16 14M20 5 4 19',
  file: 'M6.5 3.5h7l4 4v13h-11zM13.5 3.5v4h4',
  code: 'M8.5 7 3.5 12l5 5M15.5 7l5 5-5 5',
  noCloud:
    'M3.5 3.5l17 17M7 18.5h9.5M19.5 16.5A4 4 0 0 0 17 9.6a6 6 0 0 0-8.5-3.4M5.6 8.8A4.6 4.6 0 0 0 7 18.5',
  noWifi:
    'M3.5 3.5l17 17M8.6 16.4a4.8 4.8 0 0 1 6.8 0M5.2 12.9a9.6 9.6 0 0 1 4.3-2.4M14.6 10.4a9.6 9.6 0 0 1 4.2 2.5M12 20h.01',
  cloud: 'M7 18.5h10a4 4 0 0 0 .4-8 6 6 0 0 0-11.5 1.6A3.3 3.3 0 0 0 7 18.5z',
  compare: 'M9 7l-5 5 5 5M15 7l5 5-5 5',
  menu: 'M4 7h16M4 12h16M4 17h16',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 18,
  className = '',
  strokeWidth,
}: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth ?? 1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** The Terces symbol: a hexagonal aperture closing on an orange point. */
export function Logo({
  size = 28,
  className = '',
  mono = false,
}: {
  size?: number;
  className?: string;
  mono?: boolean;
}) {
  const id = useId();
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <mask id={id}>
        <rect width="64" height="64" fill="#fff" />
        <path d={cutsPath} stroke="#000" strokeWidth={SYMBOL.cutWidth} />
      </mask>
      <path
        d={symbolPath}
        fillRule="evenodd"
        fill={mono ? 'currentColor' : 'var(--color-accent)'}
        mask={`url(#${id})`}
      />
      <circle
        cx={SYMBOL.dot.cx}
        cy={SYMBOL.dot.cy}
        r={SYMBOL.dot.r}
        fill={mono ? 'currentColor' : 'var(--color-alert)'}
      />
    </svg>
  );
}

/** TERCES, hand-drawn: wide monoline letters, the last E's bar in orange. */
export function Wordmark({ height = 14, className = '' }: { height?: number; className?: string }) {
  const pad = WORDMARK.stroke;
  return (
    <svg
      viewBox={`${-pad / 2} ${-pad / 2} ${WORDMARK.width + pad} ${WORDMARK.height + pad}`}
      height={height}
      width={(height * (WORDMARK.width + pad)) / (WORDMARK.height + pad)}
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      {WORDMARK_STROKES.map((st, i) => (
        <path
          key={i}
          d={polylinePath(st.pts)}
          fill="none"
          stroke={st.accent ? 'var(--color-alert)' : 'currentColor'}
          strokeWidth={WORDMARK.stroke}
        />
      ))}
    </svg>
  );
}
