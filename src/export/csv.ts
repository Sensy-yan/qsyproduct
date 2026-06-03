function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/** 把对象数组按给定列顺序转为 RFC4180 CSV(CRLF 行分隔)。 */
export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns: string[],
): string {
  const header = columns.map(escapeCell).join(",");
  const body = rows.map((row) =>
    columns.map((c) => escapeCell(row[c])).join(","),
  );
  return [header, ...body].join("\r\n");
}
