"use client";

import type { DaySummary } from "@/lib/types";
import { fmt } from "@/lib/format";

interface Props {
  days: DaySummary[];
  dayIdx: number;
  onChange: (i: number) => void;
}

export default function DaySelector({ days, dayIdx, onChange }: Props) {
  return (
    <section className="flex flex-wrap items-center gap-2">
      <button type="button" className="btn-secondary" onClick={() => onChange(dayIdx - 1)} disabled={dayIdx <= 0}>
        ← Ziua anterioară
      </button>
      <label className="sr-only" htmlFor="day-select">
        Ziua selectată
      </label>
      <select id="day-select" className="input w-auto min-w-[16rem] font-medium" value={dayIdx} onChange={(e) => onChange(Number(e.target.value))}>
        {days.map((d, i) => (
          <option key={d.key} value={i}>
            {d.label} · PV {fmt(d.totals.ePv, 0)} kWh{d.totals.eCurt > 0 ? ` · tăiat ${fmt(d.totals.eCurt, 1)} kWh` : ""}
          </option>
        ))}
      </select>
      <button type="button" className="btn-secondary" onClick={() => onChange(dayIdx + 1)} disabled={dayIdx >= days.length - 1}>
        Ziua următoare →
      </button>
      <span className="text-sm text-slate-500">
        Ziua {dayIdx + 1} din {days.length} · poți alege ziua și din graficul cu bare de mai jos
      </span>
    </section>
  );
}
