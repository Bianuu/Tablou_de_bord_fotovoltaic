import type { AnomalyEvent, AnomalyType, DaySummary, IntervalCalc, Settings, Severity } from "./types";
import { INTERVAL_MIN, INTERVALS_PER_DAY } from "./energy";
import { fmt, minutesToTime } from "./format";

/** Fereastra în care producția PV nu ar trebui să fie zero (inclusiv capetele). */
export const PV_PEAK_START_MIN = 10 * 60;
export const PV_PEAK_END_MIN = 15 * 60;
/** Sub această putere considerăm producția PV „zero”. */
const PV_ZERO_KW = 0.001;

export const ANOMALY_LABELS: Record<AnomalyType, string> = {
  pv_zero_peak: "PV 0 kW la vârf",
  load_spike: "Vârf de consum",
  soc_jump: "Salt SOC",
  gap: "Intervale lipsă",
  incomplete_day: "Zi incompletă",
  invalid_value: "Valoare invalidă",
};

export interface AnomalyResult {
  events: AnomalyEvent[];
  /** Tipurile de anomalii pentru fiecare interval, după `idx`. */
  flags: AnomalyType[][];
  loadMean: number;
  loadStd: number;
  loadThreshold: number;
}

/**
 * Detecția deterministă (locală) a anomaliilor. Întoarce și tipurile de anomalii pe fiecare interval (`flags`),
 * pentru filtrul „Doar Anomalii” din tabelul telemetric.
 *
 * 1. PV 0 kW între 10:00 și 15:00 (posibilă oprire a invertorului, deconectare, umbrire totală).
 * 2. Consum peste media + σ·abaterea standard, calculate pe toate intervalele din fișier (σ implicit 3,2).
 * 3. Salt de SOC mai mare decât pragul (puncte procentuale într-un singur rând).
 * 4. Intervale lipsă (pas mai mare de 15 minute între rânduri) și zile cu mai puțin de 96 de intervale.
 * 5. Valorile suspecte sunt păstrate în seria brută, marcate și excluse strict din KPI.
 */
export function detectAnomalies(items: IntervalCalc[], days: DaySummary[], settings: Settings): AnomalyResult {
  const events: AnomalyEvent[] = [];
  const flags: AnomalyType[][] = items.map(() => []);
  const flag = (it: IntervalCalc, type: AnomalyType) => {
    if (!flags[it.idx].includes(type)) flags[it.idx].push(type);
  };

  const push = (type: AnomalyType, severity: Severity, a: IntervalCalc, b: IntervalCalc, title: string, detail: string) =>
    events.push({ type, severity, dayKey: a.dayKey, dayLabel: a.dayLabel, startIdx: a.idx, endIdx: b.idx, title, detail });

  // Statistica consumului pe întreaga perioadă.
  let sum = 0;
  const valid = items.filter((it) => it.energyValid);
  for (const it of valid) sum += it.load;
  const mean = valid.length ? sum / valid.length : 0;
  let sq = 0;
  for (const it of valid) sq += (it.load - mean) ** 2;
  const std = valid.length > 1 ? Math.sqrt(sq / (valid.length - 1)) : 0;
  const threshold = mean + settings.sigma * std;

  // Grupează intervale consecutive (în aceeași zi, fără goluri) care îndeplinesc o condiție.
  const runs = (test: (it: IntervalCalc) => boolean): IntervalCalc[][] => {
    const out: IntervalCalc[][] = [];
    let cur: IntervalCalc[] = [];
    for (const it of items) {
      const prev = cur[cur.length - 1];
      const contiguous = prev && prev.dayKey === it.dayKey && it.gapBeforeMin === 0 && it.idx === prev.idx + 1;
      if (test(it)) {
        if (cur.length && !contiguous) {
          out.push(cur);
          cur = [];
        }
        cur.push(it);
      } else if (cur.length) {
        out.push(cur);
        cur = [];
      }
    }
    if (cur.length) out.push(cur);
    return out;
  };

  // 0. Date brute fizic suspecte (disponibile în tabel/grafic, excluse din KPI).
  for (const it of items) {
    if (it.energyValid) continue;
    flag(it, "invalid_value");
    push(
      "invalid_value", "ridicată", it, it,
      `Valoare suspectă în CSV la ${it.time} (linia ${it.sourceLine})`,
      `${it.qualityIssues.join("; ")}. Datele PV/consum/SOC rămân afișate nealterate, dar rândul este exclus din KPI-urile energetice și statistici; bilanțul rețelei pentru intervalul următor poate fi de asemenea indisponibil dacă SOC curent este suspect.`,
    );
  }

  // 1. PV zero în orele de vârf.
  for (const run of runs((it) => it.minutes >= PV_PEAK_START_MIN && it.minutes <= PV_PEAK_END_MIN && it.energyValid && it.pv <= PV_ZERO_KW)) {
    run.forEach((it) => flag(it, "pv_zero_peak"));
    const a = run[0];
    const b = run[run.length - 1];
    push(
      "pv_zero_peak",
      run.length >= 4 ? "ridicată" : "medie",
      a,
      b,
      `PV 0 kW în orele de vârf, ${a.time}–${b.time}`,
      `Producția fotovoltaică este zero în ${run.length} interval(e) de 15 minute între 10:00 și 15:00 (${fmt((run.length * INTERVAL_MIN) / 60, 2)} h). Posibile cauze: invertor oprit sau în eroare, declanșare protecție, comunicație pierdută.`,
    );
  }

  // 2. Vârfuri anormale de consum.
  if (std > 0) {
    for (const run of runs((it) => it.energyValid && it.load > threshold)) {
      run.forEach((it) => flag(it, "load_spike"));
      const a = run[0];
      const b = run[run.length - 1];
      const peak = run.reduce((m, it) => (it.load > m.load ? it : m), a);
      const z = (peak.load - mean) / std;
      push(
        "load_spike",
        z > settings.sigma + 1 ? "ridicată" : "medie",
        a,
        b,
        run.length === 1 ? `Vârf de consum ${fmt(peak.load)} kW la ${peak.time}` : `Vârf de consum ${a.time}–${b.time}, maxim ${fmt(peak.load)} kW`,
        `Consumul depășește media perioadei (${fmt(mean)} kW) cu ${fmt(z, 1)}σ (prag ${fmt(settings.sigma, 1)}σ = ${fmt(threshold)} kW).`,
      );
    }
  }

  // 3. Salturi bruște de SOC în măsurători consecutive (nu peste intervale lipsă).
  for (const it of items) {
    if (it.energyValid && it.dSoc !== null && Math.abs(it.dSoc) > settings.socJumpPct) {
      flag(it, "soc_jump");
      const prevSoc = it.soc - it.dSoc;
      const afterGap = it.gapBeforeMin > 0 ? ` (după un gol de ${it.gapBeforeMin} minute în date)` : "";
      push(
        "soc_jump",
        Math.abs(it.dSoc) > 2 * settings.socJumpPct ? "ridicată" : "medie",
        it,
        it,
        `Salt SOC ${fmt(prevSoc, 0)}% → ${fmt(it.soc, 0)}% la ${it.time}`,
        `SOC s-a modificat cu ${fmt(it.dSoc, 1)} puncte procentuale într-un singur rând${afterGap}, adică ${fmt(Math.abs(it.dBat), 1)} kWh (${fmt(Math.abs(it.dBat) / 0.25, 1)} kW echivalent) pentru o baterie de ${fmt(settings.batteryKwh, 0)} kWh. Pragul este ${fmt(settings.socJumpPct, 0)} p.p. Poate fi o recalibrare BMS sau o eroare de citire.`,
      );
    }

  }

  // 4. Intervale lipsă între rânduri.
  for (const it of items) {
    if (it.idx === 0 || it.gapBeforeMin === 0) continue;
    flag(it, "gap");
    const prev = items[it.idx - 1];
    const missing = Math.round(it.gapBeforeMin / INTERVAL_MIN);
    const irregular = it.gapBeforeMin % INTERVAL_MIN !== 0;
    push(
      "gap",
      missing >= 4 ? "ridicată" : "medie",
      it,
      it,
      irregular
        ? `Pas neregulat între ${prev.dayLabel} ${prev.time} și ${it.time}`
        : `${missing} interval(e) lipsă înainte de ${it.time}`,
      `Între ${prev.dayLabel} ${prev.time} și ${it.dayLabel} ${it.time} lipsesc ${it.gapBeforeMin} minute de date. ` +
        `Variația SOC peste acest gol nu poate fi alocată unui singur interval. Bilanțul de rețea și curtailment-ul de la ${it.time} au fost excluse din KPI-uri; energia PV și consumul măsurate rămân afișate și incluse numai dacă sunt valide.`,
    );
  }

  // Zile incomplete (ex. prima/ultima zi din fișier).
  for (const d of days) {
    if (d.totals.intervals < INTERVALS_PER_DAY) {
      const a = items[d.start];
      const b = items[d.end];
      flag(a, "incomplete_day");
      push(
        "incomplete_day",
        "info",
        a,
        b,
        `Zi incompletă: ${d.totals.intervals} din ${INTERVALS_PER_DAY} intervale`,
        `Datele zilei acoperă ${minutesToTime(a.minutes)}–${minutesToTime(b.minutes)}. KPI-urile zilnice se calculează doar pe intervalele existente.`,
      );
    }
  }

  const order: Record<Severity, number> = { ridicată: 0, medie: 1, info: 2 };
  events.sort((x, y) => x.startIdx - y.startIdx || order[x.severity] - order[y.severity]);
  return { events, flags, loadMean: mean, loadStd: std, loadThreshold: threshold };
}
