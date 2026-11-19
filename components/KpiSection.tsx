"use client";

import type { Mode, Settings, Totals } from "@/lib/types";
import { fmt, fmtPct } from "@/lib/format";
import { independenceSentence } from "@/lib/recommendations";

interface Props {
  mode: Mode;
  period: Totals;
  day: Totals;
  dayLabel: string;
  dayCount: number;
  settings: Settings;
}

export default function KpiSection({ mode, period, day, dayLabel, dayCount, settings }: Props) {
  return (
    <section className="space-y-4">
      {mode === "proprietar" && (
        <div className="card flex flex-col gap-1 border-l-4 border-l-soc">
          <p className="text-sm font-medium text-slate-500">Independența ta energetică în ultimele {dayCount} zile</p>
          <p className="text-lg font-semibold text-slate-900">{independenceSentence(period)}</p>
          {period.savingsRon !== null ? (
            <p className="text-sm text-slate-600">
              Estimare pe intervalele cu bilanț disponibil: ai evitat cumpărarea a {fmt(period.eLoadGrid - period.eImport, 0)} kWh din rețea, adică aproximativ{" "}
              <span className="font-semibold text-slate-900">{fmt(period.savingsRon, 0)} lei</span> la tariful de {fmt(settings.tariffRon, 2)} lei/kWh.
            </p>
          ) : (
            <p className="text-sm text-amber-700">Economia nu poate fi calculată fiabil din aceste date și setări.</p>
          )}
        </div>
      )}
      <KpiRow title={`Toată perioada (${dayCount} zile)`} t={period} mode={mode} />
      <KpiRow title={`Ziua selectată · ${dayLabel}`} t={day} mode={mode} />
    </section>
  );
}

function KpiRow({ title, t, mode }: { title: string; t: Totals; mode: Mode }) {
  const owner = mode === "proprietar";
  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      <div className="grid grid-cols-2 gap-2.5 min-[360px]:gap-3 max-[359px]:grid-cols-1 md:grid-cols-3 xl:grid-cols-5">
        <Kpi
          label={owner ? "Autosuficiență" : "Autosuficiență"}
          value={fmtPct(t.selfSufficiency)}
          sub={owner ? "din consumul cu bilanț calculabil" : `(${fmt(t.eLoadGrid, 1)} − ${fmt(t.eImport, 1)}) / ${fmt(t.eLoadGrid, 1)} kWh`}
          bar={t.selfSufficiency}
          color="bg-soc"
        />
        <Kpi
          label="Autoconsum"
          value={fmtPct(t.selfConsumption)}
          sub={owner ? "din producția PV cu bilanț calculabil" : `(${fmt(t.ePvGrid, 1)} − ${fmt(t.eExport, 1)}) / ${fmt(t.ePvGrid, 1)} kWh`}
          bar={t.selfConsumption}
          color="bg-pv"
        />
        <Kpi
          label="Energie exportată"
          value={`${fmt(t.eExport, 1)} kWh`}
          sub={owner ? `estimată fără plafon; după plafon ${fmt(t.eExportEffective, 1)} kWh` : `Estimată fără plafon; după plafon ${fmt(t.eExportEffective, 1)} kWh`}
        />
        <Kpi
          label={owner ? "Energie tăiată de plafon" : "Curtailment"}
          value={`${fmt(t.eCurt, 1)} kWh`}
          sub={`${fmtPct(t.curtPct)} din exportul brut${owner ? "" : ` · ${t.curtailedIntervals} intervale`}`}
          tone={t.eCurt > 0 ? "warn" : undefined}
        />
        {owner ? (
          <Kpi label="Economie estimată" value={t.savingsRon === null ? "—" : `${fmt(t.savingsRon, 0)} lei`} sub="energie proprie × tarif" tone="good" />
        ) : (
          <Kpi
            label="Puteri de vârf"
            value={`${fmt(t.peakPv, 1)} / ${fmt(t.peakLoad, 1)} kW`}
            sub={`PV / consum · export max ${fmt(t.peakExport, 1)} kW · import max ${fmt(t.peakImport, 1)} kW`}
          />
        )}
      </div>
    </div>
  );
}

function Kpi(props: { label: string; value: string; sub?: string; bar?: number | null; color?: string; tone?: "warn" | "good" }) {
  const toneCls = props.tone === "warn" ? "text-red-700" : props.tone === "good" ? "text-emerald-700" : "text-slate-900";
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-3.5">
      <p className="text-xs font-medium text-slate-500">{props.label}</p>
      <p className={`mt-1 break-words text-xl font-semibold leading-tight tabular-nums sm:text-2xl ${toneCls}`}>{props.value}</p>
      {props.bar !== undefined && props.bar !== null && (
        <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100">
          <div className={`h-1.5 rounded-full ${props.color ?? "bg-slate-400"}`} style={{ width: `${Math.min(100, Math.max(0, props.bar))}%` }} />
        </div>
      )}
      {props.sub && <p className="mt-1.5 break-words text-[11px] leading-snug text-slate-500 sm:text-xs">{props.sub}</p>}
    </div>
  );
}
