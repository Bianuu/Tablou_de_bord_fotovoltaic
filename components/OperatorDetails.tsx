"use client";

import type { DaySummary, Settings, Totals } from "@/lib/types";
import type { AnomalyResult } from "@/lib/anomalies";
import { fmt, fmtPct } from "@/lib/format";
import { BatterySimNote } from "./OwnerInsights";

interface Props {
  period: Totals;
  day: DaySummary;
  settings: Settings;
  anomalies: AnomalyResult;
  dayCount: number;
}

type Row = [string, (t: Totals) => string, string?];

const BALANCE: Row[] = [
  ["Producție PV  Σ E_pv", (t) => `${fmt(t.ePv, 2)} kWh`],
  ["Consum  Σ E_load", (t) => `${fmt(t.eLoad, 2)} kWh`],
  ["Încărcare baterie  Σ ΔE_bat > 0", (t) => `${fmt(t.eCharge, 2)} kWh`],
  ["Descărcare baterie  Σ |ΔE_bat < 0|", (t) => `${fmt(t.eDischarge, 2)} kWh`],
  ["Variație netă baterie  Σ ΔE_bat", (t) => `${fmt(t.eBatNet, 2)} kWh`],
  ["Import din rețea  Σ max(0, −E_grid)", (t) => `${fmt(t.eImport, 2)} kWh`],
  ["Export brut  Σ max(0, E_grid)", (t) => `${fmt(t.eExport, 2)} kWh`],
  ["Energie tăiată  Σ E_curt", (t) => `${fmt(t.eCurt, 2)} kWh`, "text-red-700"],
  ["Export efectiv  export brut − tăiat", (t) => `${fmt(t.eExportEffective, 2)} kWh`],
  ["Curtailment % din export brut", (t) => fmtPct(t.curtPct, 2)],
  ["Intervale cu curtailment", (t) => String(t.curtailedIntervals)],
  ["Autoconsum (nelimitat)", (t) => fmtPct(t.selfConsumptionRaw, 2)],
  ["Autosuficiență (nelimitat)", (t) => fmtPct(t.selfSufficiencyRaw, 2)],
  [
    "Verificare bilanț  E_pv − E_load − ΔE_bat − (Exp − Imp)",
    (t) => `${fmt(t.ePv - t.eLoad - t.eBatNet - (t.eExport - t.eImport), 4)} kWh`,
    "text-slate-500",
  ],
];

const PEAKS: Row[] = [
  ["Putere PV maximă", (t) => `${fmt(t.peakPv, 2)} kW · ${t.peakPvAt}`],
  ["Consum maxim", (t) => `${fmt(t.peakLoad, 2)} kW · ${t.peakLoadAt}`],
  ["Export maxim", (t) => `${fmt(t.peakExport, 2)} kW · ${t.peakExportAt}`],
  ["Import maxim", (t) => `${fmt(t.peakImport, 2)} kW · ${t.peakImportAt}`],
  ["SOC minim / maxim", (t) => `${fmt(t.socMin, 1)}% / ${fmt(t.socMax, 1)}%`],
];

export default function OperatorDetails({ period, day, settings, anomalies, dayCount }: Props) {
  return (
    <section className="grid gap-5 xl:grid-cols-5">
      <div className="card min-w-0 overflow-x-auto xl:col-span-3">
        <h2 className="card-title mb-3">Bilanț energetic detaliat</h2>
        <MetricTable rows={BALANCE} day={day} period={period} dayCount={dayCount} />
        <h3 className="mb-2 mt-5 text-sm font-semibold text-slate-900">Puteri de vârf (15 min)</h3>
        <MetricTable rows={PEAKS} day={day} period={period} dayCount={dayCount} />
        {settings.simulateBattery && <BatterySimNote period={period} settings={settings} />}
      </div>

      <div className="card min-w-0 xl:col-span-2">
        <h2 className="card-title mb-3">Formule folosite</h2>
        <pre className="overflow-x-auto whitespace-pre rounded-lg bg-slate-900 p-3 font-mono text-[11.5px] leading-relaxed text-slate-100">
{`Δt = 0,25 h (15 minute)

E_pv(t)     = pv_kw(t) · Δt
E_load(t)   = load_kw(t) · Δt
ΔE_bat(t)   = (SOC(t) − SOC(t−1)) / 100 · ${fmt(settings.batteryKwh, 1)} kWh
E_grid(t)   = E_pv(t) − E_load(t) − ΔE_bat(t)
              > 0 export, < 0 import

P_export(t) = max(0, E_grid(t) / Δt)
P_curt(t)   = max(0, P_export(t) − ${fmt(settings.exportCapKw, 2)} kW)
E_curt(t)   = P_curt(t) · Δt

Autoconsum      = (ΣE_pv − ΣE_export) / ΣE_pv · 100
Autosuficiență  = (ΣE_load − ΣE_import) / ΣE_load · 100
Energie export. = Σ max(0, E_grid(t))`}
        </pre>
        <ul className="mt-3 space-y-1.5 text-xs text-slate-600">
          <li>Profilul bateriei este cel din CSV; plafonul nu resimulează încărcarea bateriei.</li>
          <li>Pentru primul rând din fișier ΔE_bat = 0 (nu există SOC anterior).</li>
          <li>KPI-urile procentuale afișate în carduri sunt limitate la 0–100%; aici apar și valorile nelimitate.</li>
          <li>
            Vârf de consum: load &gt; μ + {fmt(settings.sigma, 1)}σ = {fmt(anomalies.loadMean, 2)} + {fmt(settings.sigma, 1)} ×{" "}
            {fmt(anomalies.loadStd, 2)} = <b>{fmt(anomalies.loadThreshold, 2)} kW</b> (μ și σ pe toată perioada).
          </li>
          <li>Salt SOC: |ΔSOC| &gt; {fmt(settings.socJumpPct, 1)} p.p. între două rânduri consecutive.</li>
          <li>PV zero la vârf: pv_kw ≤ 0,001 kW între 10:00 și 15:00.</li>
        </ul>
      </div>
    </section>
  );
}

function MetricTable({ rows, day, period, dayCount }: { rows: Row[]; day: DaySummary; period: Totals; dayCount: number }) {
  return (
    <table className="w-full min-w-[520px] text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
          <th className="py-1.5 pr-3 font-medium">Mărime</th>
          <th className="py-1.5 pr-3 text-right font-medium">Zi · {day.label}</th>
          <th className="py-1.5 text-right font-medium">Perioadă · {dayCount} zile</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, f, cls]) => (
          <tr key={label} className="border-b border-slate-100 last:border-0">
            <td className="py-1.5 pr-3 font-mono text-xs text-slate-700">{label}</td>
            <td className={`py-1.5 pr-3 text-right tabular-nums ${cls ?? "text-slate-900"}`}>{f(day.totals)}</td>
            <td className={`py-1.5 text-right tabular-nums ${cls ?? "text-slate-900"}`}>{f(period)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
