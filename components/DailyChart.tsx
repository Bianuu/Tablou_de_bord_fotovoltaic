"use client";

import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { IntervalCalc, Mode, Settings } from "@/lib/types";
import { fmt } from "@/lib/format";
import { COLORS } from "./colors";

interface Props {
  items: IntervalCalc[];
  dayLabel: string;
  settings: Settings;
  mode: Mode;
}

interface Point {
  time: string;
  pv: number;
  load: number;
  soc: number;
  exportKw: number | null;
  importKw: number | null;
  curt: number | null;
  gridReliable: boolean;
  qualityIssues: string[];
  gridIssue: string | null;
  /** Zona tăiată: între plafon și puterea de export. */
  curtRange: [number, number] | null;
}

export default function DailyChart({ items, dayLabel, settings, mode }: Props) {
  const cap = settings.exportCapKw;
  const data = useMemo<Point[]>(
    () =>
      items.map((it) => ({
        time: it.time,
        pv: it.pv,
        load: it.load,
        soc: it.soc,
        exportKw: it.gridReliable ? it.pExport : null,
        importKw: it.gridReliable ? it.pImport : null,
        curt: it.gridReliable ? it.pCurt : null,
        gridReliable: it.gridReliable,
        qualityIssues: it.qualityIssues,
        gridIssue: it.gridIssue,
        curtRange: it.gridReliable ? [cap, cap + it.pCurt] : null,
      })),
    [items, cap],
  );
  const ticks = useMemo(() => data.filter((d) => Number(d.time.slice(3)) === 0 && Number(d.time.slice(0, 2)) % 2 === 0).map((d) => d.time), [data]);
  const curtTotal = items.reduce((s, it) => s + it.eCurt, 0);
  const socDomain: [number, number] = [Math.min(0, ...data.map((d) => d.soc)), Math.max(100, ...data.map((d) => d.soc))];

  return (
    <section className="card">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="card-title">Curba zilei · {dayLabel}</h2>
        <p className="text-xs text-slate-500">
          Rezoluție 15 minute · date brute nemodificate (inclusiv valori suspecte) · putere în kW pe axa stângă, SOC în % pe axa dreaptă
          {curtTotal > 0 ? ` · tăiat în această zi: ${fmt(curtTotal, 1)} kWh` : ""}
        </p>
      </div>

      <Legend
        items={[
          { label: "Producție PV (pv_kw)", color: COLORS.pv, kind: "line" },
          { label: "Consum (load_kw)", color: COLORS.load, kind: "line" },
          { label: "Export estimat fără plafon", color: COLORS.export, kind: "dash" },
          { label: "Putere tăiată (curtailed_kw)", color: COLORS.curt, kind: "hatch" },
          { label: `Plafon export ${fmt(cap, 1)} kW`, color: COLORS.cap, kind: "ref" },
          { label: "SOC baterie (%, axa dreaptă)", color: COLORS.soc, kind: "soc" },
        ]}
      />

      <p className="mb-1 text-[11px] text-slate-500 sm:hidden">Glisează graficul lateral pentru a vedea toate orele. Atinge curbele pentru valori.</p>
      <div className="mobile-scroll -mx-1 overflow-x-auto pb-2 sm:mx-0 sm:overflow-visible" tabIndex={0} role="region" aria-label="Graficul zilnic, derulabil orizontal pe telefon">
      <div className="h-[300px] min-w-[580px] sm:h-[360px] sm:min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 4, left: -8 }}>
            <defs>
              <pattern id="hatch-curt" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                <rect width="6" height="6" fill={COLORS.curt} fillOpacity={0.12} />
                <line x1="0" y1="0" x2="0" y2="6" stroke={COLORS.curt} strokeWidth="2.2" />
              </pattern>
            </defs>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="0" vertical={false} />
            <XAxis dataKey="time" ticks={ticks} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={{ stroke: "#cbd5e1" }} />
            <YAxis
              yAxisId="kw"
              tick={{ fontSize: 11, fill: "#64748b" }}
              tickLine={false}
              axisLine={false}
              width={56}
              domain={["auto", "auto"]}
              tickFormatter={(v: number) => fmt(v, 0)}
              label={{ value: "kW", angle: -90, position: "insideLeft", offset: 18, fontSize: 11, fill: "#64748b" }}
            />
            <YAxis
              yAxisId="soc"
              orientation="right"
              domain={socDomain}
              tick={{ fontSize: 11, fill: "#64748b" }}
              tickLine={false}
              axisLine={false}
              width={44}
              tickFormatter={(v: number) => `${v}%`}
            />
            <Tooltip content={<DailyTooltip cap={cap} mode={mode} />} cursor={{ stroke: "#94a3b8", strokeWidth: 1 }} />

            <Area
              yAxisId="kw"
              type="linear"
              dataKey="curtRange"
              stroke="none"
              fill="url(#hatch-curt)"
              isAnimationActive={false}
              activeDot={false}
              name="Putere tăiată"
            />
            <Line yAxisId="kw" type="monotone" dataKey="pv" stroke={COLORS.pv} strokeWidth={2} dot={false} isAnimationActive={false} name="PV" />
            <Line yAxisId="kw" type="monotone" dataKey="load" stroke={COLORS.load} strokeWidth={2} dot={false} isAnimationActive={false} name="Consum" />
            <Line
              yAxisId="kw"
              type="linear"
              dataKey="exportKw"
              stroke={COLORS.export}
              strokeWidth={1.5}
              strokeDasharray="5 3"
              dot={false}
              isAnimationActive={false}
              name="Export"
            />
            <Line
              yAxisId="soc"
              type="monotone"
              dataKey="soc"
              stroke={COLORS.soc}
              strokeWidth={2}
              strokeDasharray="1 3"
              strokeLinecap="round"
              dot={false}
              isAnimationActive={false}
              name="SOC"
            />
            <ReferenceLine
              yAxisId="kw"
              y={cap}
              stroke={COLORS.cap}
              strokeWidth={1.5}
              strokeDasharray="8 4"
              ifOverflow="extendDomain"
              label={{ value: `Plafon ${fmt(cap, 1)} kW`, position: "insideTopLeft", fontSize: 11, fill: COLORS.cap }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      </div>
    </section>
  );
}

function DailyTooltip({ active, payload, cap, mode }: { active?: boolean; payload?: ReadonlyArray<{ payload?: Point }>; cap: number; mode: Mode }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  const rows: [string, string, string][] = [
    ["Producție PV", `${fmt(p.pv, 2)} kW`, COLORS.pv],
    ["Consum", `${fmt(p.load, 2)} kW`, COLORS.load],
    ["SOC baterie", `${fmt(p.soc, 1)}%`, COLORS.soc],
  ];
  if (p.exportKw !== null && p.exportKw > 0) rows.push(["Export", `${fmt(p.exportKw, 2)} kW`, COLORS.export]);
  if (p.importKw !== null && p.importKw > 0) rows.push(["Import", `${fmt(p.importKw, 2)} kW`, "#64748b"]);
  if (p.curt !== null) rows.push(["Tăiat (curtailed)", `${fmt(p.curt, 2)} kW`, COLORS.curt]);
  return (
    <div className="max-w-[min(86vw,300px)] rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-slate-900">Ora {p.time}</p>
      {rows.map(([k, v, c]) => (
        <div key={k} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-slate-600">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: c }} />
            {k}
          </span>
          <span className="font-medium tabular-nums text-slate-900">{v}</span>
        </div>
      ))}
      {p.qualityIssues.length > 0 && (
        <p className="mt-2 text-[11px] font-semibold text-red-700">
          Date brute suspecte: {p.qualityIssues.join("; ")}. Excluse din KPI-uri.
        </p>
      )}
      {!p.gridReliable && <p className="mt-2 text-[11px] font-medium text-amber-700">{p.gridIssue}</p>}
      {mode === "operator" && <p className="mt-1 text-[11px] text-slate-500">P_curt = max(0, P_export − {fmt(cap, 1)} kW)</p>}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; kind: "line" | "dash" | "hatch" | "ref" | "soc" | "bar" }[] }) {
  return (
    <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          <Swatch color={it.color} kind={it.kind} />
          {it.label}
        </li>
      ))}
    </ul>
  );
}

function Swatch({ color, kind }: { color: string; kind: string }) {
  if (kind === "bar") return <span className="inline-block h-3 w-3 rounded-sm" style={{ background: color }} />;
  if (kind === "hatch")
    return (
      <span
        className="inline-block h-3 w-4 rounded-sm border"
        style={{ borderColor: color, background: `repeating-linear-gradient(45deg, ${color} 0 2px, transparent 2px 5px)` }}
      />
    );
  const dash = kind === "dash" ? "5 3" : kind === "ref" ? "6 3" : kind === "soc" ? "1 3" : undefined;
  return (
    <svg width="22" height="8" aria-hidden="true">
      <line x1="1" y1="4" x2="21" y2="4" stroke={color} strokeWidth="2" strokeDasharray={dash} strokeLinecap="round" />
    </svg>
  );
}
