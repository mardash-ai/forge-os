import { describe, it, expect } from 'vitest';
import {
  AREA_COLORS,
  normalizeColor,
  normalizeName,
  parseAreaIdField,
  validateName,
} from '../lib/areas';

describe('validateName / normalizeName', () => {
  it('trims a good name', () => {
    expect(validateName('  Health  ')).toEqual({ ok: true, value: 'Health' });
    expect(normalizeName('  Career ')).toBe('Career');
  });

  it('rejects empty / whitespace-only / non-strings', () => {
    expect(validateName('')).toEqual({ ok: false, value: '' });
    expect(validateName('   ')).toEqual({ ok: false, value: '' });
    expect(validateName(undefined)).toEqual({ ok: false, value: '' });
    expect(validateName(42)).toEqual({ ok: false, value: '' });
    expect(normalizeName(null)).toBe('');
  });
});

describe('normalizeColor', () => {
  it('keeps a valid #rrggbb hex, lower-cased', () => {
    expect(normalizeColor('#CB5320')).toBe('#cb5320');
    expect(normalizeColor('  #e9a93c ')).toBe('#e9a93c');
  });

  it('collapses anything malformed to "" (no accent, never needs escaping)', () => {
    expect(normalizeColor('red')).toBe('');
    expect(normalizeColor('#fff')).toBe(''); // 3-digit shorthand not accepted
    expect(normalizeColor('#12345')).toBe('');
    expect(normalizeColor('#gggggg')).toBe('');
    expect(normalizeColor('rgb(1,2,3)')).toBe('');
    expect(normalizeColor(undefined)).toBe('');
    expect(normalizeColor(123)).toBe('');
  });

  it('every curated swatch is itself a valid color', () => {
    for (const c of AREA_COLORS) {
      expect(normalizeColor(c)).toBe(c);
    }
  });
});

describe('parseAreaIdField', () => {
  it('absent key is not a tag op', () => {
    expect(parseAreaIdField({})).toEqual({ kind: 'absent' });
    expect(parseAreaIdField({ status: 'active' })).toEqual({ kind: 'absent' });
  });

  it('a non-empty string is a set', () => {
    expect(parseAreaIdField({ areaId: 'abc' })).toEqual({ kind: 'set', areaId: 'abc' });
  });

  it('null clears the tag', () => {
    expect(parseAreaIdField({ areaId: null })).toEqual({ kind: 'clear' });
  });

  it('anything else is invalid (a 400)', () => {
    expect(parseAreaIdField({ areaId: '' })).toEqual({ kind: 'invalid' });
    expect(parseAreaIdField({ areaId: 5 })).toEqual({ kind: 'invalid' });
    expect(parseAreaIdField({ areaId: {} })).toEqual({ kind: 'invalid' });
  });
});
