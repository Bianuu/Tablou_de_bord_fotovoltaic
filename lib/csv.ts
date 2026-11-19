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
  if (p.m < 1 || p.m > 12 || p.d < 1 || p.d > 31 || p.hh < 0 || p.hh > 23 || p.mm < 0 || p.mm > 59) return null;
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
  const rejectedRows: ParseResult["rejectedRows"] = [];
  const warnings: string[] = [];
  const formats = new Map<string, number>();
  let skipped = 0;
  let suspiciousRows = 0;
  // Pentru rândurile interpretate numeric păstrăm și textul inițial, inclusiv la duplicate.
  const rawLines = new Map<number, string>();

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") continue;
    const f = splitLine(line, delimiter);
    const lineNo = i + 1;
    const tsRaw = f[col.timestamp] ?? "";
    const ts = parseTimestamp(tsRaw);
    const pv = parseNumber(f[col.pv_kw] ?? "");
    const load = parseNumber(f[col.load_kw] ?? "");
    const soc = parseNumber(f[col.battery_soc_pct] ?? "");
    const invalidTimeStep = Boolean(ts) && ts!.ts.mm % 15 !== 0;
    const invalidSeconds = Boolean(ts) && Number(tsRaw.match(/\d{1,2}:\d{2}:(\d{2})/)?.[1] ?? 0) !== 0;
    // Doar erorile structurale sunt respinse din intervalele datate. Rămân vizibile în jurnalul datelor brute.
    const rejectReason = !ts ? `dată nerecunoscută „${tsRaw.trim()}”`
      : !Number.isFinite(pv) || !Number.isFinite(load) || !Number.isFinite(soc) ? "valoare numerică lipsă sau invalidă"
      : invalidTimeStep || invalidSeconds ? "timestamp în afara grilei de 15 minute"
      : null;
    if (rejectReason) {
      skipped++;
      rejectedRows.push({ line: lineNo, rawLine: line, reason: rejectReason });
      continue;
    }
    const qualityIssues: string[] = [];
    if (pv < 0) qualityIssues.push(`PV negativ (${pv} kW)`);
    if (load < 0) qualityIssues.push(`consum negativ (${load} kW)`);
    if (soc < 0 || soc > 100) qualityIssues.push(`SOC în afara 0–100% (${soc}%)`);
    if (qualityIssues.length) suspiciousRows++;
    formats.set(ts!.format, (formats.get(ts!.format) ?? 0) + 1);
    rows.push({ ts: ts!.ts, key: ts!.key, pv, load, soc, line: lineNo, qualityIssues });
    rawLines.set(lineNo, line);
  }

  if (rows.length === 0) {
    throw new CsvError("Nu există rânduri cu timestamp și numere interpretate. Verifică formatul fișierului.");
  }

  // Fără a modifica datele brute, selectăm o singură înregistrare per timestamp pentru calcule.
  // Preferăm o înregistrare fizic validă dacă există, altfel prima din fișier.
  rows.sort((a, b) => a.key - b.key || a.qualityIssues.length - b.qualityIssues.length || a.line - b.line);
  const unique: RawRow[] = [];
  let duplicates = 0;
  let excludedDuplicatesSuspicious = 0;
  for (const r of rows) {
    if (unique.length > 0 && unique[unique.length - 1].key === r.key) {
      duplicates++;
      if (r.qualityIssues.length) excludedDuplicatesSuspicious++;
      rejectedRows.push({ line: r.line, rawLine: rawLines.get(r.line) ?? "", reason: "timestamp duplicat; nu este inclus a doua oară în KPI" });
      continue;
    }
    unique.push(r);
  }
  suspiciousRows -= excludedDuplicatesSuspicious;
  rejectedRows.sort((a, b) => a.line - b.line);
  if (suspiciousRows) warnings.push(`${suspiciousRows} rând(uri) cu valori suspecte sunt păstrate exact ca în CSV (vizibile în grafic și tabel), marcate ca anomalii și excluse din KPI.`);
  if (skipped) warnings.push(`${skipped} rând(uri) neinterpretabile sau în afara grilei sunt păstrate în jurnalul CSV, dar nu pot fi reprezentate ca intervale valide.`);
  if (duplicates) warnings.push(`${duplicates} timestamp-uri duplicate sunt păstrate în jurnalul CSV, dar folosite o singură dată în calcule.`);

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
    rejectedRows,
    suspiciousRows,
    duplicates,
    warnings,
  };
}
