const FORMULA_CELL_PATTERN = /^[=+\-@\t\r]/;

export function csvCell(value: unknown) {
  const text = neutralizeCsvFormula(csvText(value));
  return `"${text.replaceAll('"', '""')}"`;
}

export function csvRow(values: readonly unknown[]) {
  return values.map((value) => csvCell(value)).join(',');
}

export function csvRows(headers: readonly string[], rows: Array<Record<string, unknown>>) {
  return `\uFEFF${[headers.join(','), ...rows.map((row) => csvRow(headers.map((header) => row[header])))].join('\r\n')}`;
}

export function csvTable(rows: readonly (readonly unknown[])[]) {
  return `\uFEFF${rows.map((row) => csvRow(row)).join('\r\n')}`;
}

export function neutralizeCsvFormula(value: string) {
  return FORMULA_CELL_PATTERN.test(value) ? `'${value}` : value;
}

function csvText(value: unknown) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}
