import { describe, it, expect, beforeEach } from 'vitest';
import { formatFtIn, formatLengthMm, formatAreaM2, formatVolumeM3, getUnitPref, setUnitPref, cycleUnitPref, worldToMm } from './units.js';

describe('formatFtIn', () => {
  it('formats 0mm', () => {
    expect(formatFtIn(0)).toBe("0'-0\"");
  });

  it('formats exactly 1 foot (304.8mm)', () => {
    expect(formatFtIn(304.8)).toBe("1'-0\"");
  });

  it('formats a value with a reducible fraction (5\'-3 3/4")', () => {
    expect(formatFtIn(1619)).toBe("5'-3 3/4\"");
  });

  it('formats negative values with a leading minus sign', () => {
    expect(formatFtIn(-304.8)).toBe("-1'-0\"");
  });

  it('rounds to the nearest 1/8 inch', () => {
    // 3.1875" = 3 3/16" -> nearest 1/8 is 3 1/4" (0.1875*8=1.5 -> rounds to 2/8=1/4)
    const mm = 3.1875 * 25.4;
    expect(formatFtIn(mm)).toBe("0'-3 1/4\"");
  });
});

describe('formatLengthMm', () => {
  it('formats mm as an integer with thousands separator', () => {
    expect(formatLengthMm(1619.4, 'mm')).toBe('1,619 mm');
  });

  it('formats m with 3 decimals', () => {
    expect(formatLengthMm(1619, 'm')).toBe('1.619 m');
  });

  it('formats ftin via formatFtIn', () => {
    expect(formatLengthMm(304.8, 'ftin')).toBe("1'-0\"");
  });

  it('returns empty string for non-numeric input', () => {
    expect(formatLengthMm(NaN, 'mm')).toBe('');
  });
});

describe('formatAreaM2 / formatVolumeM3', () => {
  it('formats area in m² by default', () => {
    expect(formatAreaM2(2.5, 'mm')).toBe('2.50 m²');
    expect(formatAreaM2(2.5, 'm')).toBe('2.50 m²');
  });

  it('converts area to ft² for the ftin pref', () => {
    expect(formatAreaM2(1, 'ftin')).toBe('10.76 ft²');
  });

  it('formats volume in m³ by default', () => {
    expect(formatVolumeM3(1.5, 'mm')).toBe('1.500 m³');
  });

  it('converts volume to ft³ for the ftin pref', () => {
    expect(formatVolumeM3(1, 'ftin')).toBe('35.31 ft³');
  });
});

describe('unit preference persistence', () => {
  beforeEach(() => { localStorage.clear(); });

  it('defaults to mm when nothing is stored', () => {
    expect(getUnitPref()).toBe('mm');
  });

  it('setUnitPref persists and getUnitPref reads it back', () => {
    setUnitPref('m');
    expect(getUnitPref()).toBe('m');
  });

  it('cycleUnitPref advances mm -> m -> ftin -> mm', () => {
    expect(getUnitPref()).toBe('mm');
    expect(cycleUnitPref()).toBe('m');
    expect(cycleUnitPref()).toBe('ftin');
    expect(cycleUnitPref()).toBe('mm');
  });
});

describe('worldToMm', () => {
  it('uses slot 0 lengthFactor', () => {
    const models = [{ units: { lengthFactor: 1000 } }];
    expect(worldToMm(1.5, models)).toBe(1500);
  });

  it('defaults to 1000 (metres) when no model/units present', () => {
    expect(worldToMm(2, [])).toBe(2000);
    expect(worldToMm(2, [null])).toBe(2000);
  });
});
