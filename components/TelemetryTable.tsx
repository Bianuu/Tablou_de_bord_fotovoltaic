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

const DESKTOP_PAGE = 96;
const MOBILE_PAGE = 24;

export default function TelemetryTable({ items, flags, day }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [scope, setScope] = useState<Scope>("day");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DESKTOP_PAGE);

  // Cards on small screens are taller than table rows: show fewer at a time.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setPageSize(mq.matches ? MOBILE_PAGE : DESKTOP_PAGE);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const rows = useMemo(() => {
    const base = scope === "day" ? items.slice(day.start, day.end + 1) : items;
    if (filter === "curt") return base.filter((it) => it.eCurt > 0);
    if (filter === "anom") return base.filter((it) => (flags[it.idx]?.length ?? 0) > 0);
    return base;
  }, [items, flags, day, filter, scope]);

  useEffect(() => setPage(0), [filter, scope, day.key, pageSize]);

  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const visible = rows.slice(page * pageSize, page * pageSize + pageSize);

  const download = () => {
    const header = "timestamp;source_line;pv_kw;load_kw;battery_soc_pct;pv_consum_inclus_in_kpi;motiv_excludere;grid_reliable;delta_soc_pp;delta_e_bat_kwh;e_grid_kwh;p_export_kw;p_curtailed_kw;e_curtailed_kwh;anomalii";
    const lines = rows.map((it) =>
      [
        `${it.dayLabel} ${it.time}`,
        it.sourceLine,
        it.pv,
        it.load,
        it.soc,
        it.energyValid ? "da" : "nu",
        it.gridIssue ?? "",
        it.gridReliable ? "da" : "nu",
        it.dSoc ?? "",
        it.gridReliable ? it.dBat.toFixed(4) : "",
        it.gridReliable ? it.eGrid.toFixed(4) : "",
        it.gridReliable ? it.pExport.toFixed(3) : "",
        it.gridReliable ? it.pCurt.toFixed(3) : "",
        it.gridReliable ? it.eCurt.toFixed(4) : "",
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
    <section className="card" aria-label="Date brute și tabel telemetric">
      <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="card-title">Date brute și tabel telemetric (15 minute)</h2>
          <p className="text-xs text-slate-500">{rows.length.toLocaleString("ro-RO")} rânduri după filtrare ·
            valorile PV / consum / SOC sunt cele originale; fondul portocaliu marchează anomaliile.
            „Inclus în KPI” = Nu pentru rândurile suspecte. Pentru bilanț indisponibil apare „—”.</p>
        </div>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
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
          <button type="button" className="btn-secondary w-full sm:w-auto" onClick={download} disabled={rows.length === 0}>
            Exportă CSV
          </button>
        </div>
      </div>

      <p className="mb-2 text-xs text-slate-500 sm:hidden">Vizualizare simplificată pentru telefon. Poți exporta CSV-ul pentru toate coloanele.</p>
      <div className="space-y-2 md:hidden" aria-label="Înregistrări telemetrice pentru mobil">
        {visible.map((it) => {
          const f = flags[it.idx] ?? [];
          return (
            <article key={it.idx} className={`min-w-0 rounded-lg border p-3 ${f.length ? "border-amber-300 bg-amber-50" : it.eCurt > 0 ? "border-red-200 bg-red-50/60" : "border-slate-200 bg-slate-50"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">{it.dayLabel} · {it.time}</p>
                <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${it.energyValid && it.gridReliable ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
                  {!it.energyValid ? "Exclus din KPI" : !it.gridReliable ? "Bilanț indisponibil" : "Bilanț calculabil"}
                </span>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <div><dt className="text-slate-500">PV original</dt><dd className="font-semibold tabular-nums">{fmt(it.pv, 2)} kW</dd></div>
                <div><dt className="text-slate-500">Consum original</dt><dd className="font-semibold tabular-nums">{fmt(it.load, 2)} kW</dd></div>
                <div><dt className="text-slate-500">SOC original</dt><dd className="font-semibold tabular-nums">{fmt(it.soc, 1)}%</dd></div>
                <div><dt className="text-slate-500">Export estimat</dt><dd className="font-semibold tabular-nums">{it.gridReliable ? `${fmt(it.pExport, 2)} kW` : "—"}</dd></div>
                <div><dt className="text-slate-500">Putere tăiată</dt><dd className="font-semibold tabular-nums">{it.gridReliable ? `${fmt(it.pCurt, 2)} kW` : "—"}</dd></div>
                <div><dt className="text-slate-500">Energie tăiată</dt><dd className="font-semibold tabular-nums">{it.gridReliable ? `${fmt(it.eCurt, 3)} kWh` : "—"}</dd></div>
              </dl>
              {it.gridIssue && <p className="mt-2 break-words text-xs font-medium text-amber-900">{it.gridIssue}</p>}
              {f.length > 0 && <p className="mt-2 break-words text-xs text-amber-900"><strong>Anomalii:</strong> {f.map((x) => ANOMALY_LABELS[x]).join(" · ")}</p>}
              <p className="mt-2 text-[11px] text-slate-500">Linia CSV {it.sourceLine}</p>
            </article>
          );
        })}
        {visible.length === 0 && <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">Niciun interval pentru filtrul ales.</p>}
      </div>
      <div className="mobile-scroll hidden max-h-[520px] overflow-auto rounded-lg border border-slate-200 md:block" tabIndex={0} role="region" aria-label="Tabel telemetric complet cu derulare orizontală">
        <table className="w-full min-w-[980px] text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-slate-600">
            <tr>
              {[
                "Data / ora",
                "Linia CSV",
                "pv_kw",
                "load_kw",
                "SOC %",
                "PV/consum KPI",
                "Motiv / calitate",
                "Bilanț valid",
                "ΔSOC p.p.",
                "ΔE_bat kWh",
                "E_grid kWh",
                "P_export kW",
                "P_curt kW",
                "E_curt kWh",
                "Anomalii",
              ].map((h, i) => (
                <th key={h} className={`whitespace-nowrap px-2.5 py-2 font-semibold ${i > 1 && i < 5 || i > 7 && i < 14 ? "text-right" : ""}`}>
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
                  <td className="px-2.5 py-1.5 text-right">{it.sourceLine}</td>
                  <Num v={it.pv} d={2} />
                  <Num v={it.load} d={2} />
                  <Num v={it.soc} d={1} />
                  <td className={`px-2.5 py-1.5 text-center font-medium ${it.energyValid ? "text-emerald-700" : "text-red-700"}`}>
                    {it.energyValid ? "Da" : "Nu"}
                  </td>
                  <td className="min-w-44 max-w-80 px-2.5 py-1.5 text-amber-900">{it.gridIssue ?? "—"}</td>
                  <td className="px-2.5 py-1.5 text-center">{it.gridReliable ? "Da" : "Nu"}</td>
                  <Num v={it.dSoc} d={1} />
                  <Num v={it.gridReliable ? it.dBat : null} d={3} />
                  <Num v={it.gridReliable ? it.eGrid : null} d={3} cls={it.eGrid > 0 ? "text-export" : it.eGrid < 0 ? "text-slate-600" : ""} />
                  <Num v={it.gridReliable ? it.pExport : null} d={2} />
                  <Num v={it.gridReliable ? it.pCurt : null} d={2} cls={it.pCurt > 0 ? "font-semibold text-red-700" : ""} />
                  <Num v={it.gridReliable ? it.eCurt : null} d={3} cls={it.eCurt > 0 ? "font-semibold text-red-700" : ""} />
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
                <td colSpan={15} className="px-3 py-6 text-center text-sm text-slate-500">
                  Niciun interval pentru filtrul ales.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="mt-3 flex items-center justify-between gap-2 text-sm sm:justify-end">
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
    <div className="flex w-full min-w-0 flex-wrap rounded-lg border border-slate-300 bg-slate-100 p-0.5 text-sm sm:w-auto">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`min-h-10 flex-1 rounded-md px-2 py-1 text-xs font-medium leading-tight transition sm:flex-none sm:px-2.5 sm:text-sm ${value === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
