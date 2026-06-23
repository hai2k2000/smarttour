export function toReportCsv(rows: Array<Record<string, unknown>>) {
  if (!rows.length) return '\uFEFF';
  const headers = Object.keys(rows[0]);
  return `\uFEFF${[
    headers.join(','),
    ...rows.map((row) => headers.map((header) => reportCsvValue(row[header])).join(',')),
  ].join('\r\n')}`;
}

function reportCsvValue(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}
