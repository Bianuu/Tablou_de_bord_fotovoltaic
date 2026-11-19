"use client";

import type { DaySummary, Mode } from "@/lib/types";
import { fmt } from "@/lib/format";

interface Props {
  allDays: DaySummary[];
  rangeStart: number;
  rangeEnd: number;
  onRangeChange: (start: number, end: number) => void;
  days: DaySummary[];
  dayIdx: number;
  onChange: (i: number) => void;
  mode: Mode;
}

export default function DaySelector({
  allDays,
  rangeStart,
  rangeEnd,
  onRangeChange,
  days,
  dayIdx,
  onChange,
  mode,
}: Props) {
  const totalDays = allDays.length;
  const isFiltered = totalDays > 0 && (rangeStart > 0 || rangeEnd < totalDays - 1);

  const presetBtn = (active: boolean) =>
    active
      ? "rounded-full border border-sky-600 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800 transition"
      : "rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50";

  return (
    <section aria-label="Selectare interval și zi analizată" className="card space-y-4 !p-3 sm:!p-4">
      {/* Proprietarul vede întâi ziua; intervalul rămâne disponibil la cerere.
          Operatorul pornește cu filtrul tehnic deschis. */}
      <details key={mode} open={mode === "operator"} className="group border-b border-slate-100 pb-3.5">
        <summary className="cursor-pointer select-none text-sm font-semibold text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500">
          {mode === "proprietar" ? "Opțional: selectează un interval de zile" : "Filtrare interval analizat"}
          <span className="ml-2 text-xs font-normal text-slate-500">({days.length} din {totalDays} zile)</span>
        </summary>
      <div className="mt-3 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Interval analizat</h2>
          <span className="text-xs font-medium text-slate-500">
            {days.length} din {totalDays} {totalDays === 1 ? "zi" : "zile"}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="flex items-center gap-2">
            <label htmlFor="range-start" className="w-14 shrink-0 text-xs font-medium text-slate-600">
              De la:
            </label>
            <select
              id="range-start"
              className="input min-w-0 flex-1 text-sm font-medium"
              value={rangeStart}
              onChange={(e) => {
                const nextStart = Number(e.target.value);
                onRangeChange(nextStart, Math.max(nextStart, rangeEnd));
              }}
            >
              {allDays.map((d, i) => (
                <option key={d.key} value={i} disabled={i > rangeEnd}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="range-end" className="w-14 shrink-0 text-xs font-medium text-slate-600">
              Până la:
            </label>
            <select
              id="range-end"
              className="input min-w-0 flex-1 text-sm font-medium"
              value={rangeEnd}
              onChange={(e) => {
                const nextEnd = Number(e.target.value);
                onRangeChange(Math.min(rangeStart, nextEnd), nextEnd);
              }}
            >
              {allDays.map((d, i) => (
                <option key={d.key} value={i} disabled={i < rangeStart}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {totalDays > 1 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <button
              type="button"
              className={presetBtn(!isFiltered)}
              onClick={() => onRangeChange(0, totalDays - 1)}
            >
              Toată perioada ({totalDays} zile)
            </button>
            {totalDays > 7 && (
              <>
                <button
                  type="button"
                  className={presetBtn(rangeStart === 0 && rangeEnd === 6)}
                  onClick={() => onRangeChange(0, Math.min(6, totalDays - 1))}
                >
                  Primele 7 zile
                </button>
                <button
                  type="button"
                  className={presetBtn(rangeStart === totalDays - 7 && rangeEnd === totalDays - 1)}
                  onClick={() => onRangeChange(Math.max(0, totalDays - 7), totalDays - 1)}
                >
                  Ultimele 7 zile
                </button>
              </>
            )}
            {totalDays > 14 && (
              <button
                type="button"
                className={presetBtn(rangeStart === totalDays - 14 && rangeEnd === totalDays - 1)}
                onClick={() => onRangeChange(Math.max(0, totalDays - 14), totalDays - 1)}
              >
                Ultimele 14 zile
              </button>
            )}
          </div>
        )}

        {isFiltered && (
          <p className="text-xs text-sky-800">
            Interval activ: KPI-urile și graficul zilnic agregat reflectă cele {days.length} zile selectate. Curtailment-ul
            total pe toate cele {totalDays} zile, anomaliile globale și baza de comparație AI rămân păstrate.
          </p>
        )}
      </div>
      </details>

      {/* 2. Selector de zi individuală din interval */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Ziua analizată</h2>
          <span className="text-xs font-medium text-slate-500">
            {dayIdx + 1} din {days.length}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <label className="sr-only" htmlFor="day-select">
            Ziua selectată
          </label>
          <select
            id="day-select"
            className="input col-span-2 min-w-0 font-medium sm:order-2 sm:w-auto sm:max-w-[27rem] sm:flex-1"
            value={dayIdx}
            onChange={(e) => onChange(Number(e.target.value))}
          >
            {days.map((d, i) => (
              <option key={d.key} value={i}>
                {d.label} · PV {fmt(d.totals.ePv, 0)} kWh
                {d.totals.eCurt > 0 ? ` · tăiat ${fmt(d.totals.eCurt, 1)} kWh` : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-secondary min-w-0 sm:order-1"
            onClick={() => onChange(dayIdx - 1)}
            disabled={dayIdx <= 0}
          >
            <span aria-hidden="true">←</span> <span className="sm:hidden">Anterioară</span>
            <span className="hidden sm:inline">Ziua anterioară</span>
          </button>
          <button
            type="button"
            className="btn-secondary min-w-0 sm:order-3"
            onClick={() => onChange(dayIdx + 1)}
            disabled={dayIdx >= days.length - 1}
          >
            <span className="sm:hidden">Următoare</span>
            <span className="hidden sm:inline">Ziua următoare</span> <span aria-hidden="true">→</span>
          </button>
        </div>
        <p className="hidden text-xs text-slate-500 sm:block">
          Poți alege ziua și atingând o coloană din graficul agregat pe zile.
        </p>
      </div>
    </section>
  );
}