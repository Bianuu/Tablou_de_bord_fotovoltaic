"use client";

import { useEffect, useMemo, useState } from "react";
import type { AnomalyType, DaySummary, IntervalCalc } from "@/lib/types";
import { ANOMALY_LABELS } from "@/lib/anomalies";
import { fmt } from "@/lib/format";

interface Props {
  items: IntervalCalc[];
  flags: AnomalyType[][];
  day: DaySummary;
}

type Filter = "all" | "curt" | "anom";
type Scope = "day" | "period";

const PAGE = 96;

export default function TelemetryTable({ items, flags, day }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [scope, setScope] = useState<Scope>("day");
  const [page, setPage] = useState(0);

  const rows = useMemo(() => {
    const base = scope === "day" ? items.slice(day.start, day.end + 1) : items;
    if (filter === "curt") return base.filter((it) => it.eCurt > 0);
    if (filter === "anom") return base.filter((it) => (flags[it.idx]?.length ?? 0) > 0);
    return base;
  }, [items, flags, day, filter, scope]);

  useEffect(() => setPage(0), [filter, scope, day.key]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const visible = rows.slice(page * PAGE, page * PAGE + PAGE);

  const download = () => {
    const header = "timestamp;pv_kw;load_kw;battery_soc_pct;delta_soc_pp;delta_e_bat_kwh;e_grid_kwh;p_export_kw;p_curtailed_kw;e_curtailed_kwh;anomalii";
    const lines = rows.map((it) =>
      [
        `${it.dayLabel} ${it.time}`,
        it.pv,
        it.load,
        it.soc,
        it.dSoc ?? "",
        it.dBat.toFixed(4),
        it.eGrid.toFixed(4),
        it.pExport.toFixed(3),
        it.pCurt.toFixed(3),
        it.eCurt.toFixed(4),
        (flags[it.idx] ?? []).map((f) => ANOMALY_LABELS[f]).join(" | "),
      ].join(";"),
    );
    const blob = new Blob(["﻿" + [header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `telemetrie_${scope === "day" ? day.key : "perioada"}_${filter}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="card-title">Tabel telemetric (15 minute)</h2>
          <p className="text-xs text-slate-500">{rows.length.toLocaleString("ro-RO")} rânduri afișate după filtrare</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Toggle
            value={scope}
            onChange={setScope}
            options={[
              ["day", `Ziua ${day.label}`],
              ["period", "Toată perioada"],
            ]}
          />
          <Toggle
            value={filter}
            onChange={setFilter}
            options={[
              ["all", "Toate intervalele"],
              ["curt", "Doar Curtailment"],
              ["anom", "Doar Anomalii"],
            ]}
          />
          <button type="button" className="btn-secondary" onClick={download} disabled={rows.length === 0}>
            Exportă CSV
          </button>
        </div>
      </div>

      <div className="max-h-[520px] overflow-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[980px] text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-slate-600">
            <tr>
              {[
                "Data / ora",
                "pv_kw",
                "load_kw",
                "SOC %",
                "ΔSOC p.p.",
                "ΔE_bat kWh",
                "E_grid kWh",
                "P_export kW",
                "P_curt kW",
                "E_curt kWh",
                "Anomalii",
              ].map((h, i) => (
                <th key={h} className={`whitespace-nowrap px-2.5 py-2 font-semibold ${i > 0 && i < 10 ? "text-right" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((it) => {
              const f = flags[it.idx] ?? [];
              return (
                <tr key={it.idx} className={`border-t border-slate-100 ${f.length ? "bg-amber-50" : it.eCurt > 0 ? "bg-red-50/60" : ""}`}>
                  <td className="whitespace-nowrap px-2.5 py-1.5 font-mono">
                    {it.dayLabel} {it.time}
                  </td>
                  <Num v={it.pv} d={2} />
                  <Num v={it.load} d={2} />
                  <Num v={it.soc} d={1} />
                  <Num v={it.dSoc} d={1} />
                  <Num v={it.dBat} d={3} />
                  <Num v={it.eGrid} d={3} cls={it.eGrid > 0 ? "text-export" : it.eGrid < 0 ? "text-slate-600" : ""} />
                  <Num v={it.pExport} d={2} />
                  <Num v={it.pCurt} d={2} cls={it.pCurt > 0 ? "font-semibold text-red-700" : ""} />
                  <Num v={it.eCurt} d={3} cls={it.eCurt > 0 ? "font-semibold text-red-700" : ""} />
                  <td className="px-2.5 py-1.5">
                    {f.map((x) => (
                      <span key={x} className="chip mr-1 bg-amber-100 text-amber-800">
                        {ANOMALY_LABELS[x]}
                      </span>
                    ))}
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-6 text-center text-sm text-slate-500">
                  Niciun interval pentru filtrul ales.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm">
          <button type="button" className="btn-secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>
            ←
          </button>
          <span className="text-slate-600">
            Pagina {page + 1} din {pages}
          </span>
          <button type="button" className="btn-secondary" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
            →
          </button>
        </div>
      )}
    </section>
  );
}

function Num({ v, d, cls }: { v: number | null; d: number; cls?: string }) {
  return <td className={`whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums ${cls ?? ""}`}>{v === null ? "—" : fmt(v, d)}</td>;
}

function Toggle<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="flex rounded-lg border border-slate-300 bg-slate-100 p-0.5 text-sm">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`rounded-md px-2.5 py-1 font-medium transition ${value === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
