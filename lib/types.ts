export type Mode = "proprietar" | "operator";

/** Data și ora așa cum sunt scrise în CSV (ora locală a locației, fără fus orar). */
export interface TsParts {
  y: number;
  m: number;
  d: number;
  hh: number;
  mm: number;
}

/** Un rând valid din CSV. */
export interface RawRow {
  ts: TsParts;
  /** Milisecunde calculate din componentele datei ca și cum ar fi UTC: pas constant de 15 minute, fără salturi de oră de vară. */
  key: number;
  pv: number;
  load: number;
  soc: number;
  /** Numărul liniei din fișier (1 = antetul). */
  line: number;
}

export interface ParseResult {
  rows: RawRow[];
  fileName: string;
  delimiter: string;
  /** Formatul de dată recunoscut în majoritatea rândurilor. */
  timestampFormat: string;
  skipped: number;
  duplicates: number;
  warnings: string[];
}

export interface Settings {
  batteryKwh: number;
  exportCapKw: number;
  tariffRon: number;
  simulateBattery: boolean;
  sigma: number;
  socJumpPct: number;
}

export type AnomalyType =
  | "pv_zero_peak"
  | "load_spike"
  | "soc_jump"
  | "gap"
  | "incomplete_day"
  | "invalid_value";

export type Severity = "ridicată" | "medie" | "info";

export interface IntervalCalc {
  idx: number;
  dayKey: string;
  dayLabel: string;
  time: string;
  /** Minute de la miezul nopții. */
  minutes: number;
  pv: number;
  load: number;
  soc: number;
  /** Variația SOC față de rândul anterior (puncte procentuale); null pentru primul rând. */
  dSoc: number | null;
  ePv: number;
  eLoad: number;
  dBat: number;
  eGrid: number;
  eExport: number;
  eImport: number;
  pExport: number;
  pImport: number;
  pCurt: number;
  eCurt: number;
  /** Energie tăiată care ar fi încăput în baterie (doar cu simularea pornită). */
  eAbsorbed: number;
  /** Minute lipsă înaintea acestui rând (0 dacă pasul este de 15 minute). */
  gapBeforeMin: number;
}

export interface Totals {
  intervals: number;
  ePv: number;
  eLoad: number;
  eExport: number;
  eImport: number;
  eCurt: number;
  eExportEffective: number;
  eCharge: number;
  eDischarge: number;
  eBatNet: number;
  eAbsorbed: number;
  /** Energie tăiată în intervale în care bateria era deja plină (SOC ≥ 99%). */
  eCurtBatteryFull: number;
  peakPv: number;
  peakPvAt: string;
  peakLoad: number;
  peakLoadAt: string;
  peakExport: number;
  peakExportAt: string;
  peakImport: number;
  peakImportAt: string;
  socMin: number;
  socMax: number;
  curtailedIntervals: number;
  /** Autoconsum (%) limitat la 0-100; null dacă nu există producție. */
  selfConsumption: number | null;
  selfConsumptionRaw: number | null;
  /** Autosuficiență (%) limitată la 0-100; null dacă nu există consum. */
  selfSufficiency: number | null;
  selfSufficiencyRaw: number | null;
  /** Energie tăiată ca procent din exportul brut. */
  curtPct: number;
  savingsRon: number;
}

export interface DaySummary {
  key: string;
  label: string;
  /** Indicele primului și ultimului interval al zilei în lista completă. */
  start: number;
  end: number;
  totals: Totals;
}

export interface AnomalyEvent {
  type: AnomalyType;
  severity: Severity;
  dayKey: string;
  dayLabel: string;
  startIdx: number;
  endIdx: number;
  title: string;
  detail: string;
}

export interface AnalyzeAnomaly {
  severity: Severity;
  title: string;
  detail: string;
}

/** Ce trimite browserul către /api/analyze. Promptul se construiește pe server din aceste date. */
export interface AnalyzePayload {
  mode: Mode;
  dayLabel: string;
  daysInPeriod: number;
  settings: Pick<Settings, "batteryKwh" | "exportCapKw" | "tariffRon">;
  dayTotals: Totals;
  periodTotals: Totals;
  anomalies: AnalyzeAnomaly[];
  /** Seria zilei: un rând per interval, "HH:MM;pv_kw;load_kw;soc_pct;e_grid_kwh;curtailed_kw". */
  series: string;
}

export type Provider = "anthropic" | "openai" | "gemini" | "openrouter";

export interface AnalyzeRequest {
  target: "claude" | "other";
  provider: Provider;
  model: string;
  apiKey?: string;
  payload: AnalyzePayload;
}

export interface AnalyzeResponse {
  text: string;
  provider: Provider;
  model: string;
  notice?: string;
}
