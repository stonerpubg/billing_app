// Simple CSV export helper — builds a CSV string from an array of rows + column defs
// and triggers a browser download. Works in both Electron and web modes (Blob + a[download]).

function esc(v) {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function toCsv(rows, columns) {
  // columns: [{ key: 'foo', label: 'Foo', get?: (row) => value }]
  const headers = columns.map((c) => esc(c.label || c.key)).join(',');
  const body = rows
    .map((r) =>
      columns
        .map((c) => esc(c.get ? c.get(r) : r[c.key]))
        .join(',')
    )
    .join('\n');
  return headers + '\n' + body;
}

export function downloadCsv(filename, rows, columns) {
  const csv = toCsv(rows, columns);
  // BOM for Excel to recognize UTF-8
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : filename + '.csv';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 100);
}
