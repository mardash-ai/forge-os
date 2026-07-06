// Maps progress (0–100) onto the smith's tempering ramp — the signature encoding
// from DESIGN.md §2/§3. Pure and unit-testable: no DOM, no React.

type RGB = readonly [number, number, number];

// temper-blue → dull red → forge-orange → straw → white-hot
const RAMP: ReadonlyArray<{ at: number; rgb: RGB }> = [
  { at: 0, rgb: [0x38, 0x50, 0x6b] }, // --t0 cold / unworked
  { at: 25, rgb: [0x7e, 0x2b, 0x18] }, // --t1 just catching
  { at: 50, rgb: [0xcb, 0x53, 0x20] }, // --t2 working heat
  { at: 75, rgb: [0xe9, 0xa9, 0x3c] }, // --t3 nearly forged
  { at: 100, rgb: [0xfb, 0xf1, 0xd6] }, // --t4 forged / white-hot
];

const COLD = RAMP[0].rgb;

function clampPercent(p: number): number {
  if (Number.isNaN(p)) return 0;
  return Math.max(0, Math.min(100, p));
}

function rgb(c: RGB): string {
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/** The endpoint (hottest) color for a given progress percent. */
export function heatColor(percent: number): string {
  const p = clampPercent(percent);
  for (let i = 1; i < RAMP.length; i++) {
    const hi = RAMP[i];
    if (p <= hi.at) {
      const lo = RAMP[i - 1];
      const t = (p - lo.at) / (hi.at - lo.at);
      return rgb([
        Math.round(lo.rgb[0] + (hi.rgb[0] - lo.rgb[0]) * t),
        Math.round(lo.rgb[1] + (hi.rgb[1] - lo.rgb[1]) * t),
        Math.round(lo.rgb[2] + (hi.rgb[2] - lo.rgb[2]) * t),
      ]);
    }
  }
  return rgb(RAMP[RAMP.length - 1].rgb);
}

export interface HeatStyle {
  edge: string; // the bright "working edge" color at the fill boundary
  background: string; // gradient from cold to the endpoint color
  boxShadow: string; // outer glow; intensity scales with progress
}

/** Inline-style values for a Heat Bar fill at a given percent. */
export function heatStyle(percent: number): HeatStyle {
  const p = clampPercent(percent);
  const edge = heatColor(p);
  const f = p / 100;
  const channels = edge.replace(/rgb\(|\)/g, ''); // "r, g, b" for the glow's rgba()
  const glowBlur = Math.round(4 + f * 20);
  const glowAlpha = (0.15 + f * 0.6).toFixed(2);
  return {
    edge,
    background: `linear-gradient(90deg, ${rgb(COLD)}, ${edge})`,
    boxShadow: p === 0 ? 'none' : `0 0 ${glowBlur}px rgba(${channels}, ${glowAlpha})`,
  };
}
