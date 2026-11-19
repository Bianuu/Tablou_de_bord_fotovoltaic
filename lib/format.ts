import type { TsParts } from "./types";

const formatters = new Map<number, Intl.NumberFormat>();

/** Număr în format românesc (virgulă zecimală, punct pentru mii). */
export function fmt(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  let f = formatters.get(digits);
  if (!f) {
    f = new Intl.NumberFormat("ro-RO", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    formatters.set(digits, f);
  }
  // Evită „-0,0”.
  const rounded = Number(value.toFixed(digits));
  return f.format(rounded === 0 ? 0 : rounded);
}

export function fmtPct(value: number | null | undefined, digits = 1): string {
  const s = fmt(value, digits);
  return s === "—" ? s : `${s}%`;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function dayKeyOf(ts: TsParts): string {
  return `${ts.y}-${pad(ts.m)}-${pad(ts.d)}`;
}

export function dayLabelOf(ts: TsParts): string {
  return `${pad(ts.d)}.${pad(ts.m)}.${ts.y}`;
}

export function timeOf(ts: TsParts): string {
  return `${pad(ts.hh)}:${pad(ts.mm)}`;
}

export function minutesToTime(min: number): string {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}
