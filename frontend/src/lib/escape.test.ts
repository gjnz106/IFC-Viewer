import { describe, it, expect } from 'vitest';
import { escapeHtml, escapeCsv } from './escape.js';

describe('escapeHtml', () => {
  it('neutralises the XSS-relevant characters', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe(
      '&lt;img src=x onerror=alert(1)&gt;'
    );
    expect(escapeHtml(`a & b "c" 'd' <e>`)).toBe('a &amp; b &quot;c&quot; &#39;d&#39; &lt;e&gt;');
  });
  it('handles null/undefined/numbers', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(42)).toBe('42');
  });
  it('breaks out of neither attribute nor JS-string contexts', () => {
    // a GlobalId-style value with a quote can no longer close an attribute
    expect(escapeHtml('2O2Fr$"onclick')).not.toContain('"');
  });
});

describe('escapeCsv', () => {
  it('quotes and doubles embedded quotes', () => {
    expect(escapeCsv('a,b')).toBe('"a,b"');
    expect(escapeCsv('say "hi"')).toBe('"say ""hi"""');
  });
  it('neutralises spreadsheet formula injection', () => {
    expect(escapeCsv('=CMD()')).toBe(`"'=CMD()"`);
    expect(escapeCsv('+1+2')).toBe(`"'+1+2"`);
    expect(escapeCsv('-2')).toBe(`"'-2"`);
    expect(escapeCsv('@x')).toBe(`"'@x"`);
  });
  it('leaves plain values quoted but unprefixed', () => {
    expect(escapeCsv('Pipe 54mm')).toBe('"Pipe 54mm"');
    expect(escapeCsv(null)).toBe('""');
  });
});
