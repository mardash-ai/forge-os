import { describe, it, expect } from 'vitest';
import { heatColor, heatStyle } from '../lib/heat';

describe('heatColor', () => {
  it('is cold temper-blue at 0%', () => {
    expect(heatColor(0)).toBe('rgb(56, 80, 107)');
  });

  it('is forge-orange at the midpoint', () => {
    expect(heatColor(50)).toBe('rgb(203, 83, 32)');
  });

  it('is white-hot at 100%', () => {
    expect(heatColor(100)).toBe('rgb(251, 241, 214)');
  });

  it('clamps out-of-range input', () => {
    expect(heatColor(-20)).toBe(heatColor(0));
    expect(heatColor(140)).toBe(heatColor(100));
    expect(heatColor(NaN)).toBe(heatColor(0));
  });
});

describe('heatStyle', () => {
  it('has no glow when cold', () => {
    expect(heatStyle(0).boxShadow).toBe('none');
  });

  it('glows once there is any heat', () => {
    expect(heatStyle(50).boxShadow).not.toBe('none');
  });

  it('always fills from the cold end', () => {
    expect(heatStyle(75).background).toContain('rgb(56, 80, 107)');
    expect(heatStyle(75).background).toContain(heatColor(75));
  });
});
