import type { DaySummary, IntervalCalc, RawRow, Settings, Totals } from "./types";
import { dayKeyOf, dayLabelOf, timeOf } from "./format";

/** Durata unui interval în ore (15 minute). */
export const DT_H = 0.25;
export const INTERVAL_MIN = 15;
export const INTERVALS_PER_DAY = 96;

/**
 * Calculează bilanțul energetic pe fiecare interval de 15 minute.
 *
 *   E_pv(t)     = pv_kw(t) · 0,25                                   [kWh]
 *   E_load(t)   = load_kw(t) · 0,25                                 [kWh]
 *   ΔE_bat(t)   = (SOC(t) − SOC(t−1)) / 100 · Capacitate_kWh        [kWh]  (+ încărcare, − descărcare)
 *   E_grid(t)   = E_pv(t) − E_load(t) − ΔE_bat(t)                   [kWh]  (+ export, − import)
 *   P_export(t) = max(0, E_grid(t) / 0,25)                          [kW]
 *   P_curt(t)   = max(0, P_export(t) − P_plafon)                    [kW]
 *   E_curt(t)   = P_curt(t) · 0,25                                  [kWh]
 *
 * Pentru primul rând ΔE_bat=0 (ipoteză explicită). Dacă lipsesc măsurători între două rânduri,
 * NU atribuim saltul SOC intervalului următor: bilanțul de rețea și curtailment-ul sunt necunoscute
 * pe acel rând și sunt excluse din KPI-urile aferente. Restul profilului SOC rămâne neschimbat.
 */
export function computeIntervals(rows: RawRow[], settings: Settings): IntervalCalc[] {
  const cap = Math.max(0, settings.exportCapKw);
  const capacity = Math.max(0, settings.batteryKwh);
  const out: IntervalCalc[] = [];
  let extraStored = 0;
  let prevDay = "";

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const prev = i > 0 ? rows[i - 1] : null;
    const dayKey = dayKeyOf(r.ts);

    const energyValid = r.qualityIssues.length === 0;
    // Păstrăm valorile PV/consum/SOC brute în interval; doar contribuțiile la KPI sunt excluse.
    const ePv = energyValid ? r.pv * DT_H : 0;
    const eLoad = energyValid ? r.load * DT_H : 0;
    const gapBeforeMin = prev ? Math.max(0, Math.round((r.key - prev.key) / 60000) - INTERVAL_MIN) : 0;
    const gridIssue = !energyValid
      ? `Valoare fizic suspectă: ${r.qualityIssues.join("; ")}. Rând exclus din toate KPI-urile.`
      : prev && (prev.soc < 0 || prev.soc > 100)
        ? "SOC anterior suspect; bilanțul acestui interval nu este calculabil. PV și consumul sunt incluse."
        : prev && r.key - prev.key !== INTERVAL_MIN * 60_000
          ? "Interval anterior lipsă; ΔSOC și bilanțul de rețea nu pot fi atribuite acestui interval."
          : null;
    const gridReliable = gridIssue === null;
    const dSoc = prev && gridReliable ? r.soc - prev.soc : null;
    const dBat = dSoc === null ? 0 : (dSoc / 100) * capacity;
    // Zero este un placeholder pentru seriile numerice; gridReliable=false semnalează
    // explicit faptul că puterea/energia de rețea NU este 0 măsurat, ci necunoscut.
    const eGrid = gridReliable ? ePv - eLoad - dBat : 0;
    const eExport = Math.max(0, eGrid);
    const eImport = Math.max(0, -eGrid);
    const pExport = eExport / DT_H;
    const pImport = eImport / DT_H;
    const pCurt = Math.max(0, pExport - cap);
    const eCurt = pCurt * DT_H;

    // Simulare opțională: cât din energia tăiată ar fi încăput în baterie până la 100% SOC.
    // Spațiul liber la momentul t este (100 − SOC(t)) % din capacitate, minus energia „recuperată”
    // deja în aceeași zi. Contorul se resetează la miezul nopții (presupunem că surplusul stocat
    // se consumă seara/noaptea). Nu se modifică datele din fișier, este doar o estimare comparativă.
    if (dayKey !== prevDay) {
      extraStored = 0;
      prevDay = dayKey;
    }
    let eAbsorbed = 0;
    if (settings.simulateBattery && eCurt > 0) {
      const headroom = Math.max(0, ((100 - r.soc) / 100) * capacity - extraStored);
      eAbsorbed = Math.min(eCurt, headroom);
      extraStored += eAbsorbed;
    }

    out.push({
      idx: i,
      dayKey,
      dayLabel: dayLabelOf(r.ts),
      time: timeOf(r.ts),
      minutes: r.ts.hh * 60 + r.ts.mm,
      pv: r.pv,
      load: r.load,
      soc: r.soc,
      sourceLine: r.line,
      qualityIssues: r.qualityIssues,
      energyValid,
      gridIssue,
      dSoc,
      gridReliable,
      ePv,
      eLoad,
      dBat,
      eGrid,
      eExport,
      eImport,
      pExport,
      pImport,
      pCurt,
      eCurt,
      eAbsorbed,
      gapBeforeMin,
    });
  }
  return out;
}

// Nu ascunde rezultatele imposibile prin limitare artificială la 0–100%.
const validPct = (v: number | null) => v === null || !Number.isFinite(v) || v < -1e-7 || v > 100 + 1e-7
  ? null : Math.min(100, Math.max(0, v));

export function summarize(items: IntervalCalc[], settings: Settings): Totals {
  const t: Totals = {
    intervals: items.length,
    gridIntervals: 0,
    invalidIntervals: 0,
    excludedGridIntervals: 0,
    ePvGrid: 0,
    eLoadGrid: 0,
    ePv: 0,
    eLoad: 0,
    eExport: 0,
    eImport: 0,
    eCurt: 0,
    eExportEffective: 0,
    eCharge: 0,
    eDischarge: 0,
    eBatNet: 0,
    eAbsorbed: 0,
    eCurtBatteryFull: 0,
    peakPv: 0,
    peakPvAt: "—",
    peakLoad: 0,
    peakLoadAt: "—",
    peakExport: 0,
    peakExportAt: "—",
    peakImport: 0,
    peakImportAt: "—",
    socMin: items.length ? Infinity : NaN,
    socMax: items.length ? -Infinity : NaN,
    curtailedIntervals: 0,
    selfConsumption: null,
    selfConsumptionRaw: null,
    selfSufficiency: null,
    selfSufficiencyRaw: null,
    curtPct: 0,
    savingsRon: 0,
  };

  for (const it of items) {
    if (!it.energyValid) t.invalidIntervals++;
    t.ePv += it.ePv;
    t.eLoad += it.eLoad;
    if (it.gridReliable) {
      t.gridIntervals++;
      t.ePvGrid += it.ePv;
      t.eLoadGrid += it.eLoad;
    } else {
      t.excludedGridIntervals++;
    }
    t.eExport += it.eExport;
    t.eImport += it.eImport;
    t.eCurt += it.eCurt;
    t.eAbsorbed += it.eAbsorbed;
    if (it.dBat > 0) t.eCharge += it.dBat;
    else t.eDischarge += -it.dBat;
    t.eBatNet += it.dBat;
    if (it.eCurt > 0) {
      t.curtailedIntervals++;
      if (it.soc >= 99) t.eCurtBatteryFull += it.eCurt;
    }
    const at = `${it.dayLabel} ${it.time}`;
    if (it.energyValid && it.pv > t.peakPv) {
      t.peakPv = it.pv;
      t.peakPvAt = at;
    }
    if (it.energyValid && it.load > t.peakLoad) {
      t.peakLoad = it.load;
      t.peakLoadAt = at;
    }
    if (it.pExport > t.peakExport) {
      t.peakExport = it.pExport;
      t.peakExportAt = at;
    }
    if (it.pImport > t.peakImport) {
      t.peakImport = it.pImport;
      t.peakImportAt = at;
    }
    if (it.energyValid) {
      t.socMin = Math.min(t.socMin, it.soc);
      t.socMax = Math.max(t.socMax, it.soc);
    }
  }

  if (!items.some((it) => it.energyValid)) {
    t.socMin = NaN;
    t.socMax = NaN;
  }
  t.eExportEffective = t.eExport - t.eCurt;
  // Autoconsum (%) = (E_pv_total − E_export_total) / E_pv_total · 100
  t.selfConsumptionRaw = t.ePvGrid > 0 ? ((t.ePvGrid - t.eExport) / t.ePvGrid) * 100 : null;
  // Autosuficiență (%) = (E_load_total − E_import_total) / E_load_total · 100
  t.selfSufficiencyRaw = t.eLoadGrid > 0 ? ((t.eLoadGrid - t.eImport) / t.eLoadGrid) * 100 : null;
  t.selfConsumption = validPct(t.selfConsumptionRaw);
  t.selfSufficiency = validPct(t.selfSufficiencyRaw);
  t.curtPct = t.eExport > 0 ? (t.eCurt / t.eExport) * 100 : 0;
  // Economie estimată: energia consumată care NU a fost cumpărată din rețea, la tariful setat.
  t.savingsRon = validPct(t.selfSufficiencyRaw) === null ? null : Math.max(0, t.eLoadGrid - t.eImport) * Math.max(0, settings.tariffRon);
  return t;
}

export function groupDays(items: IntervalCalc[], settings: Settings): DaySummary[] {
  const days: DaySummary[] = [];
  let start = 0;
  for (let i = 1; i <= items.length; i++) {
    if (i === items.length || items[i].dayKey !== items[start].dayKey) {
      const slice = items.slice(start, i);
      days.push({
        key: items[start].dayKey,
        label: items[start].dayLabel,
        start,
        end: i - 1,
        totals: summarize(slice, settings),
      });
      start = i;
    }
  }
  return days;
}

/** Cea mai mare putere de export din date (folosită pentru limita sliderului). */
export function maxExportPower(items: IntervalCalc[]): number {
  let m = 0;
  for (const it of items) if (it.pExport > m) m = it.pExport;
  return m;
}

/**
 * Cel mai mic plafon (kW) la care energia tăiată rămâne sub `targetPct` % din exportul brut.
 * Exportul brut nu depinde de plafon, deci căutarea binară este exactă.
 */
export function capForCurtailmentBelow(items: IntervalCalc[], targetPct: number): number {
  let totalExport = 0;
  let hi = 0;
  for (const it of items) {
    totalExport += it.eExport;
    if (it.pExport > hi) hi = it.pExport;
  }
  if (totalExport <= 0) return 0;
  const limit = (targetPct / 100) * totalExport;
  const curtAt = (cap: number) => {
    let s = 0;
    for (const it of items) s += Math.max(0, it.pExport - cap) * DT_H;
    return s;
  };
  let lo = 0;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (curtAt(mid) <= limit) hi = mid;
    else lo = mid;
  }
  return hi;
}
