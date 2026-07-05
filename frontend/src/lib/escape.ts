// Shared HTML/CSV escaping helpers.
//
// IFC files are user-supplied and their string fields (Name, Tag, ObjectType,
// property values, GlobalId, …) end up interpolated into innerHTML across the
// app. Without escaping, a crafted IFC (e.g. an element named
// `<img src=x onerror=alert(1)>`) executes script when the compare tree, issue
// cards, clash cards or property panel render. Route every IFC-derived string
// through escapeHtml before putting it in markup.

/** Escape a value for safe insertion into HTML text OR a double-quoted attribute. */
export function escapeHtml(s: unknown): string {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>
  )[c]);
}

/**
 * Escape a field for a CSV cell: always quote, double embedded quotes, and
 * neutralise spreadsheet formula injection (a leading =, +, -, @, tab or CR
 * makes Excel/Sheets evaluate the cell) by prefixing a single quote.
 */
export function escapeCsv(s: unknown): string {
  let v = s == null ? '' : String(s);
  if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
  return '"' + v.replace(/"/g, '""') + '"';
}
