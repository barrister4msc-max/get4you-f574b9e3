export function exportToCsv(filename: string, rows: Record<string, any>[], columns?: { key: string; label: string }[]) {
  if (!rows.length) return;
  const keys = columns ? columns.map(c => c.key) : Object.keys(rows[0]);
  const headers = columns ? columns.map(c => c.label) : keys;
  const csvContent = [
    headers.join(','),
    ...rows.map(row => keys.map(k => {
      const val = row[k] ?? '';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    }).join(','))
  ].join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
