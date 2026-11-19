import type { ParseResult, RawRow, TsParts } from "./types";
import { dayLabelOf, timeOf } from "./format";

export const REQUIRED_COLUMNS = ["timestamp", "pv_kw", "load_kw", "battery_soc_pct"] as const;

export class CsvError extends Error {}

/**
 * Formatul cerut: DD-MM-YY H:MM (ex. „01-06-26 5:15”).
 * Acceptă și separatorii „.” și „/”, anul pe 4 cifre, ora pe 1-2 cifre și secunde opționale.
 * Ziua este întotdeauna prima (format românesc), deci „01-06-26” este 1 iunie 2026.
 */
const DMY = /^(\d{1,2})[-./](\d{1,2})[-./](\d{2}|\d{4})[ T]+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/;

/**
 * ISO 8601: „2026-06-01T05:15”, „2026-06-01 05:15:00”, „2026-06-01T05:15:00Z”.
 * Ora este luată exact cum este scrisă; un eventual fus orar (Z, +03:00) este ignorat,
 * ca toate rândurile să rămână în ora locală a instalației.
 */
const ISO = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T]+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(?:Z|[+-]\d{2}:?\d{2})?$/i;

function validParts(p: TsParts): number | null {
  if (p.m < 1 || p.m > 12 || p.d < 1 || p.d > 31 || p.hh > 23 || p.mm > 59) return null;
  const key = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm);
  const check = new Date(key);
  // Respinge date imposibile (ex. 31-06), pe care Date.UTC le-ar muta în luna următoare.
  if (check.getUTCDate() !== p.d || check.getUTCMonth() !== p.m - 1) return null;
  return key;
}

export function parseTimestamp(raw: string): { ts: TsParts; key: number; format: string } | null {
  const s = raw.trim().replace(/^"|"$/g, "").trim();
  let m = DMY.exec(s);
  if (m) {
    const yRaw = m[3];
    const ts: TsParts = {
      d: Number(m[1]),
      m: Number(m[2]),
      y: yRaw.length === 2 ? 2000 + Number(yRaw) : Number(yRaw),
      hh: Number(m[4]),
      mm: Number(m[5]),
    };
    const key = validParts(ts);
    if (key === null) return null;
    return { ts, key, format: yRaw.length === 2 ? "DD-MM-YY H:MM" : "DD-MM-YYYY HH:MM" };
  }
  m = ISO.exec(s);
  if (m) {
    const ts: TsParts = { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]), hh: Number(m[4]), mm: Number(m[5]) };
    const key = validParts(ts);
    if (key === null) return null;
    return { ts, key, format: "ISO 8601" };
  }
  return null;
}

/** Număr cu punct sau virgulă zecimală („12.5” sau „12,5”). */
export function parseNumber(raw: string): number {
  let s = raw.trim().replace(/^"|"$/g, "").replace(/\s/g, "");
  if (s === "") return NaN;
  if (s.includes(",") && !s.includes(".")) s = s.replace(",", ".");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return NaN;
  return Number(s);
}

/** Desparte o linie CSV ținând cont de câmpurile între ghilimele. */
function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (c === delim && !quoted) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function detectDelimiter(header: string): string {
  const candidates = [",", ";", "\t"];
  let best = ",";
  let bestCount = -1;
  for (const d of candidates) {
    const n = header.split(d).length - 1;
    if (n > bestCount) {
      best = d;
      bestCount = n;
    }
  }
  return best;
}

export function parseCsv(text: string, fileName: string): ParseResult {
  const lines = text.replace(/^﻿/, "").split(/\r\n|\n|\r/);
  const headerIdx = lines.findIndex((l) => l.trim() !== "");
  if (headerIdx < 0) throw new CsvError("Fișierul este gol.");

  const delimiter = detectDelimiter(lines[headerIdx]);
  const header = splitLine(lines[headerIdx], delimiter).map((h) => h.trim().replace(/^"|"$/g, "").trim().toLowerCase());
  const col: Record<string, number> = {};
  for (const name of REQUIRED_COLUMNS) col[name] = header.indexOf(name);
  const missing = REQUIRED_COLUMNS.filter((n) => col[n] < 0);
  if (missing.length > 0) {
    throw new CsvError(
      `Lipsesc coloanele: ${missing.join(", ")}. Antetul găsit: ${header.join(", ") || "(gol)"}. ` +
        `Fișierul trebuie să aibă exact coloanele: ${REQUIRED_COLUMNS.join(", ")}.`,
    );
  }

  const rows: RawRow[] = [];
  const warnings: string[] = [];
  const formats = new Map<string, number>();
  let skipped = 0;
  const badLines: string[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") continue;
    const f = splitLine(line, delimiter);
    const lineNo = i + 1;
    const ts = parseTimestamp(f[col.timestamp] ?? "");
    const pv = parseNumber(f[col.pv_kw] ?? "");
    const load = parseNumber(f[col.load_kw] ?? "");
    const soc = parseNumber(f[col.battery_soc_pct] ?? "");
    if (!ts || !Number.isFinite(pv) || !Number.isFinite(load) || !Number.isFinite(soc)) {
      skipped++;
      if (badLines.length < 5) {
        const why = !ts ? `dată nerecunoscută „${(f[col.timestamp] ?? "").trim()}”` : "valoare numerică lipsă sau invalidă";
        badLines.push(`linia ${lineNo} (${why})`);
      }
      continue;
    }
    formats.set(ts.format, (formats.get(ts.format) ?? 0) + 1);
    rows.push({ ts: ts.ts, key: ts.key, pv, load, soc, line: lineNo });
  }

  if (rows.length === 0) {
    throw new CsvError(
      "Niciun rând valid. Verifică formatul datei (ex. „01-06-26 5:15”, „01-06-2026 05:15” sau ISO „2026-06-01T05:15”) și valorile numerice.",
    );
  }

  if (skipped > 0) {
    warnings.push(`${skipped} rânduri ignorate: ${badLines.join("; ")}${skipped > badLines.length ? " …" : ""}.`);
  }

  // Ordine cronologică; la marcaje de timp duplicate se păstrează primul rând.
  rows.sort((a, b) => a.key - b.key || a.line - b.line);
  const unique: RawRow[] = [];
  let duplicates = 0;
  for (const r of rows) {
    if (unique.length > 0 && unique[unique.length - 1].key === r.key) {
      duplicates++;
      if (duplicates <= 3) {
        warnings.push(`Marcaj de timp duplicat ${dayLabelOf(r.ts)} ${timeOf(r.ts)} (linia ${r.line}); s-a păstrat primul rând.`);
      }
      continue;
    }
    unique.push(r);
  }
  if (duplicates > 3) warnings.push(`În total ${duplicates} rânduri duplicate ignorate.`);

  let timestampFormat = "";
  let best = -1;
  formats.forEach((n, name) => {
    if (n > best) {
      best = n;
      timestampFormat = name;
    }
  });

  return {
    rows: unique,
    fileName,
    delimiter: delimiter === "\t" ? "TAB" : delimiter,
    timestampFormat,
    skipped,
    duplicates,
    warnings,
  };
}
