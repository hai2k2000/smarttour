import { csvRows } from '../../common/csv-export';

export function toReportCsv(rows: Array<Record<string, unknown>>) {
  if (!rows.length) return '\uFEFF';
  const headers = Object.keys(rows[0]);
  return csvRows(headers, rows);
}
