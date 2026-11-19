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
    <section aria-label="Navigare între zile" className="card space-y-3 !p-3 sm:!p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Ziua analizată</h2>
        <span className="text-xs font-medium text-slate-500">{dayIdx + 1} din {days.length}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <label className="sr-only" htmlFor="day-select">Ziua selectată</label>
        <select
          id="day-select"
          className="input col-span-2 min-w-0 font-medium sm:order-2 sm:w-auto sm:max-w-[27rem] sm:flex-1"
          value={dayIdx}
          onChange={(e) => onChange(Number(e.target.value))}
        >
          {days.map((d, i) => (
            <option key={d.key} value={i}>
              {d.label} · PV {fmt(d.totals.ePv, 0)} kWh{d.totals.eCurt > 0 ? ` · tăiat ${fmt(d.totals.eCurt, 1)} kWh` : ""}
            </option>
          ))}
        </select>
        <button type="button" className="btn-secondary min-w-0 sm:order-1" onClick={() => onChange(dayIdx - 1)} disabled={dayIdx <= 0}>
          <span aria-hidden="true">←</span> <span className="sm:hidden">Anterioară</span><span className="hidden sm:inline">Ziua anterioară</span>
        </button>
        <button type="button" className="btn-secondary min-w-0 sm:order-3" onClick={() => onChange(dayIdx + 1)} disabled={dayIdx >= days.length - 1}>
          <span className="sm:hidden">Următoare</span><span className="hidden sm:inline">Ziua următoare</span> <span aria-hidden="true">→</span>
        </button>
      </div>
      <p className="hidden text-xs text-slate-500 sm:block">Poți alege ziua și atingând o coloană din graficul lunar.</p>
    </section>
  );
}
