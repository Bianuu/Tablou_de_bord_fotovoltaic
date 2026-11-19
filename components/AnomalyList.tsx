"use client";

import { useState } from "react";
import type { AnomalyEvent, Mode, Severity } from "@/lib/types";
import { ANOMALY_LABELS } from "@/lib/anomalies";

interface Props {
  mode: Mode;
  dayEvents: AnomalyEvent[];
  allEvents: AnomalyEvent[];
  dayLabel: string;
}

const SEVERITY_STYLE: Record<Severity, string> = {
  ridicată: "bg-red-100 text-red-800",
  medie: "bg-amber-100 text-amber-800",
  info: "bg-slate-100 text-slate-700",
};

const OWNER_TEXT: Record<string, string> = {
  pv_zero_peak: "Panourile nu au produs nimic la prânz.",
  load_spike: "Consum neobișnuit de mare.",
  soc_jump: "Nivelul bateriei s-a schimbat brusc (posibilă eroare de măsurare).",
  gap: "Lipsesc date din fișier.",
  incomplete_day: "Ziua nu are date complete.",
  invalid_value: "Valoare imposibilă în fișier.",
};

export default function AnomalyList({ mode, dayEvents, allEvents, dayLabel }: Props) {
  const [scope, setScope] = useState<"day" | "all">("day");
  const events = scope === "day" ? dayEvents : allEvents;
  const counts = allEvents.reduce<Record<string, number>>((acc, e) => {
    acc[e.type] = (acc[e.type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <section className="card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="card-title">Anomalii detectate local</h2>
          <p className="text-xs text-slate-500">
            Detecție deterministă: PV 0 kW între 10:00–15:00, vârfuri de consum peste prag σ, salturi de SOC, intervale lipsă.
          </p>
        </div>
        <div className="flex rounded-lg border border-slate-300 bg-slate-100 p-0.5 text-sm">
          <ScopeBtn active={scope === "day"} onClick={() => setScope("day")}>
            Ziua {dayLabel} ({dayEvents.length})
          </ScopeBtn>
          <ScopeBtn active={scope === "all"} onClick={() => setScope("all")}>
            Toată perioada ({allEvents.length})
          </ScopeBtn>
        </div>
      </div>

      {scope === "all" && allEvents.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {Object.entries(counts).map(([type, n]) => (
            <span key={type} className="chip bg-slate-100 text-slate-700">
              {ANOMALY_LABELS[type as keyof typeof ANOMALY_LABELS]}: {n}
            </span>
          ))}
        </div>
      )}

      {events.length === 0 ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Nicio anomalie {scope === "day" ? "în această zi" : "în toată perioada"}.
        </p>
      ) : (
        <ul className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
          {events.map((e, i) => (
            <li key={`${e.type}-${e.startIdx}-${i}`} className="rounded-lg border border-slate-200 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`chip ${SEVERITY_STYLE[e.severity]}`}>{e.severity}</span>
                <span className="chip bg-slate-100 text-slate-700">{ANOMALY_LABELS[e.type]}</span>
                {scope === "all" && <span className="text-xs text-slate-500">{e.dayLabel}</span>}
                <span className="text-sm font-medium text-slate-900">{e.title}</span>
              </div>
              <p className="mt-1 text-sm text-slate-600">{mode === "proprietar" ? OWNER_TEXT[e.type] : e.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ScopeBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-md px-2.5 py-1 font-medium transition ${active ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
    >
      {children}
    </button>
  );
}
