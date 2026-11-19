"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Rectangle, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { BarShapeProps } from "recharts";
import type { DaySummary } from "@/lib/types";
import { fmt, fmtPct } from "@/lib/format";
import { COLORS } from "./colors";
import { Legend } from "./DailyChart";

interface Props {
  days: DaySummary[];
  dayIdx: number;
  onSelect: (i: number) => void;
  simulate: boolean;
}

interface Point {
  idx: number;
  label: string;
  full: string;
  exportEff: number;
  curt: number;
  absorbed: number;
  curtPct: number;
}

export default function MonthlyChart({ days, dayIdx, onSelect, simulate }: Props) {
  const data = useMemo<Point[]>(
    () =>
      days.map((d, i) => ({
        idx: i,
        label: d.label.slice(0, 5),
        full: d.label,
        exportEff: d.totals.eExportEffective,
        curt: d.totals.eCurt,
        absorbed: d.totals.eAbsorbed,
        curtPct: d.totals.curtPct,
      })),
    [days],
  );

  const select = (state: { activeTooltipIndex?: number | string | null; activeIndex?: number | string | null } | null | undefined) => {
    const raw = state?.activeTooltipIndex ?? state?.activeIndex;
    const i = raw === null || raw === undefined ? NaN : Number(raw);
    if (Number.isInteger(i) && i >= 0 && i < days.length) onSelect(i);
  };

  return (
    <section className="card">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="card-title">Export efectiv vs. energie tăiată, pe zile</h2>
        <p className="text-xs text-slate-500">kWh pe zi · click pe o coloană pentru a deschide ziua</p>
      </div>
      <Legend
        items={[
          { label: "Export efectiv (kWh)", color: COLORS.export, kind: "bar" },
          { label: "Energie tăiată / curtailment (kWh)", color: COLORS.curt, kind: "bar" },
          ...(simulate ? [{ label: "Din energia tăiată, ar fi încăput în baterie (kWh)", color: COLORS.absorb, kind: "bar" as const }] : []),
        ]}
      />
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 4, left: -8 }} onClick={select} barCategoryGap="18%" style={{ cursor: "pointer" }}>
            <CartesianGrid stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={{ stroke: "#cbd5e1" }} interval="preserveStartEnd" minTickGap={8} />
            <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => fmt(v, 0)} />
            <Tooltip content={<MonthlyTooltip simulate={simulate} />} cursor={{ fill: "#f1f5f9" }} />
            <Bar dataKey="exportEff" stackId="export" fill={COLORS.export} isAnimationActive={false} name="Export efectiv" shape={(props: BarShapeProps) => highlight(props, dayIdx, true)} />
            <Bar dataKey="curt" stackId="export" fill={COLORS.curt} radius={[3, 3, 0, 0]} isAnimationActive={false} name="Energie tăiată" shape={(props: BarShapeProps) => highlight(props, dayIdx, true)} />
            {simulate && (
              <Bar dataKey="absorbed" fill={COLORS.absorb} radius={[3, 3, 0, 0]} isAnimationActive={false} name="Recuperabil în baterie" shape={(props: BarShapeProps) => highlight(props, dayIdx, false)} />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

/** Ziua selectată rămâne plină și conturată; celelalte zile se estompează. */
function highlight(props: BarShapeProps, dayIdx: number, outline: boolean) {
  const selected = props.index === dayIdx;
  return <Rectangle {...props} fillOpacity={selected ? 1 : 0.55} stroke={selected && outline ? "#0f172a" : "none"} strokeWidth={selected ? 1 : 0} />;
}

function MonthlyTooltip({ active, payload, simulate }: { active?: boolean; payload?: ReadonlyArray<{ payload?: Point }>; simulate: boolean }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-slate-900">{p.full}</p>
      <Row color={COLORS.export} label="Export efectiv" value={`${fmt(p.exportEff, 1)} kWh`} />
      <Row color={COLORS.curt} label="Energie tăiată" value={`${fmt(p.curt, 1)} kWh (${fmtPct(p.curtPct)})`} />
      {simulate && <Row color={COLORS.absorb} label="Ar fi încăput în baterie" value={`${fmt(p.absorbed, 1)} kWh`} />}
      <p className="mt-1 text-[11px] text-slate-500">Click pentru a deschide ziua</p>
    </div>
  );
}

function Row({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-slate-600">
        <span className="inline-block h-2 w-2 rounded-sm" style={{ background: color }} />
        {label}
      </span>
      <span className="font-medium tabular-nums text-slate-900">{value}</span>
    </div>
  );
}
