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
          <p className="text-sm text-slate-600">
            Ai evitat cumpărarea a {fmt(period.eLoad - period.eImport, 0)} kWh din rețea, adică aproximativ{" "}
            <span className="font-semibold text-slate-900">{fmt(period.savingsRon, 0)} lei</span> la tariful de {fmt(settings.tariffRon, 2)}{" "}
            lei/kWh.
          </p>
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
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi
          label={owner ? "Autosuficiență" : "Autosuficiență"}
          value={fmtPct(t.selfSufficiency)}
          sub={owner ? "din consum acoperit din panouri și baterie" : `(${fmt(t.eLoad, 1)} − ${fmt(t.eImport, 1)}) / ${fmt(t.eLoad, 1)} kWh`}
          bar={t.selfSufficiency}
          color="bg-soc"
        />
        <Kpi
          label="Autoconsum"
          value={fmtPct(t.selfConsumption)}
          sub={owner ? "din producția PV folosită pe loc" : `(${fmt(t.ePv, 1)} − ${fmt(t.eExport, 1)}) / ${fmt(t.ePv, 1)} kWh`}
          bar={t.selfConsumption}
          color="bg-pv"
        />
        <Kpi
          label="Energie exportată"
          value={`${fmt(t.eExport, 1)} kWh`}
          sub={owner ? `din care ${fmt(t.eExportEffective, 1)} kWh ar intra efectiv în rețea` : `Σ max(0, E_grid) · efectiv ${fmt(t.eExportEffective, 1)} kWh`}
        />
        <Kpi
          label={owner ? "Energie tăiată de plafon" : "Curtailment"}
          value={`${fmt(t.eCurt, 1)} kWh`}
          sub={`${fmtPct(t.curtPct)} din exportul brut${owner ? "" : ` · ${t.curtailedIntervals} intervale`}`}
          tone={t.eCurt > 0 ? "warn" : undefined}
        />
        {owner ? (
          <Kpi label="Economie estimată" value={`${fmt(t.savingsRon, 0)} lei`} sub="energie proprie × tarif" tone="good" />
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
    <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
      <p className="text-xs font-medium text-slate-500">{props.label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${toneCls}`}>{props.value}</p>
      {props.bar !== undefined && props.bar !== null && (
        <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100">
          <div className={`h-1.5 rounded-full ${props.color ?? "bg-slate-400"}`} style={{ width: `${Math.min(100, Math.max(0, props.bar))}%` }} />
        </div>
      )}
      {props.sub && <p className="mt-1.5 text-xs leading-snug text-slate-500">{props.sub}</p>}
    </div>
  );
}
