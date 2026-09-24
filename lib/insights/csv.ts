import { InputError } from "../security/url";

// RFC 4180 quoting, embedded newlines and UTF-8 BOM. No spreadsheet execution.
export function csvRows(input: string): Record<string, string>[] {
  const source = input.replace(/^\uFEFF/, "");
  const rows: string[][] = []; let row: string[] = [], value = "", quoted = false, closed = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') { value += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else value += c;
    } else if (c === '"' && !value && !closed) quoted = true;
    else if (c === ",") { row.push(value); value = ""; closed = false; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && source[i + 1] === "\n") i++;
      row.push(value); if (row.some(Boolean)) rows.push(row); row = []; value = ""; closed = false;
    } else { if (closed || c === '"') throw new InputError("Malformed CSV quoting."); value += c; }
  }
  if (quoted) throw new InputError("CSV has an unclosed quoted field.");
  row.push(value); if (row.some(Boolean)) rows.push(row);
  const header = rows.shift();
  if (!header || !["provider", "question", "answer", "observed_at"].every((k) => header.includes(k)) || new Set(header).size !== header.length) throw new InputError("CSV needs unique provider, question, answer and observed_at columns.");
  const allowed = ["provider", "model", "question", "answer", "citation_urls", "observed_at", "notes"];
  if (header.some((key) => !allowed.includes(key))) throw new InputError("CSV contains an unknown column.");
  return rows.map((cells) => { if (cells.length !== header.length) throw new InputError("CSV row does not match its header."); return Object.fromEntries(header.map((key, i) => [key, cells[i]])); });
}
export function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const keys = [...new Set(rows.flatMap(Object.keys))];
  const cell = (value: unknown) => {
    let text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
    if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return "\uFEFF" + [keys.map(cell).join(","), ...rows.map((row) => keys.map((key) => cell(row[key])).join(","))].join("\r\n");
}

