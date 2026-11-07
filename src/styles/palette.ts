// The Ice palette, for code that draws outside the DOM (share card, icons, shaders).
// Must match src/styles/tokens.css (checked by tests/unit/palette.test.ts).
export const ICE = {
  void: '#04070c',
  deep: '#071019',
  panel: '#0a1622',
  raised: '#0f2233',
  line: '#1d3a52',
  edge: '#2e5a7c',
  ink: '#eaf6ff',
  soft: '#c6dbea',
  dim: '#9dbbd1',
  muted: '#7fa3bd',
  accent: '#8de8ff',
  alert: '#ff7320',
  safe: '#5ee6a8',
} as const;

/** 0..1 RGB for shader uniforms. */
export const rgb = (hex: string): [number, number, number] =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
