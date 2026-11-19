"use client";

import { useEffect, useState } from "react";
import type { Mode, Settings } from "@/lib/types";
import { fmt } from "@/lib/format";

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  maxExport: number;
  mode: Mode;
}

export default function SettingsPanel({ settings, onChange, maxExport, mode }: Props) {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v });
  const sliderMax = Math.max(1, Math.ceil(Math.max(maxExport, settings.exportCapKw) * 1.1));
  const step = sliderMax > 50 ? 0.5 : 0.1;

  const [advancedOpen, setAdvancedOpen] = useState(mode === "operator");
  useEffect(() => setAdvancedOpen(mode === "operator"), [mode]);

  return (
    <section className="card" aria-labelledby="settings-title">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="settings-title" className="card-title">{mode === "proprietar" ? "Câtă energie poate fi trimisă în rețea?" : "Simulare tehnică · plafon de export"}</h2>
          <p className="text-xs text-slate-500">{mode === "proprietar" ? "Alege o limită și vezi cât surplus s-ar putea pierde. Nu schimbăm datele bateriei." : "Modificările actualizează instantaneu bilanțul, KPI-urile și graficele de curtailment."}</p>
        </div>
        <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">{fmt(settings.exportCapKw, 1)} kW</span>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
        <label className="label" htmlFor="cap-number">Plafon maxim permis la export (kW)</label>
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="range"
            aria-label="Plafon de export (kW)"
            min={0}
            max={sliderMax}
            step={step}
            value={Math.min(settings.exportCapKw, sliderMax)}
            onChange={(e) => set("exportCapKw", Number(e.target.value))}
            className="h-11 w-full min-w-0 flex-1 cursor-pointer accent-curt sm:h-3"
          />
          <div className="w-full sm:w-32">
            <NumberInput id="cap-number" value={settings.exportCapKw} min={0} step={step} onCommit={(v) => set("exportCapKw", v)} wide />
          </div>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-600">
          Puterea maximă exportabilă estimată din CSV: <strong>{fmt(maxExport, 2)} kW</strong>. Plafonul de {fmt(settings.exportCapKw, 1)} kW
          reprezintă scenariul ales pentru analiză, nu o limită detectată automat din instalație.
        </p>
      </div>

      <button
        type="button"
        className="btn-secondary mt-3 w-full sm:w-auto"
        aria-expanded={advancedOpen}
        aria-controls="advanced-settings"
        onClick={() => setAdvancedOpen((v) => !v)}
      >
        {advancedOpen ? "Ascunde parametrii suplimentari" : "Baterie, tarif și opțiuni avansate"}
        <span aria-hidden="true">{advancedOpen ? "−" : "+"}</span>
      </button>
      <div id="advanced-settings" className={`${advancedOpen ? "block" : "hidden"} space-y-4 pt-4`}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NumberField
            label="Capacitate baterie (kWh)"
            value={settings.batteryKwh}
            min={0}
            step={1}
            onCommit={(v) => set("batteryKwh", v)}
            hint="Transformă variația SOC (%) în energie: ΔE = ΔSOC/100 × capacitate."
          />
          <NumberField
            label="Tarif energie (RON/kWh)"
            value={settings.tariffRon}
            min={0}
            step={0.01}
            onCommit={(v) => set("tariffRon", v)}
            hint="Folosit pentru economia estimată."
          />
        </div>
        <div className="flex flex-col gap-4 border-t border-slate-100 pt-4 lg:flex-row lg:items-start lg:gap-8">
          <label className="flex min-w-0 max-w-xl cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={settings.simulateBattery}
              onChange={(e) => set("simulateBattery", e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-600"
            />
            <span>
              <span className="font-medium">Simulează redistribuire surplus tăiat în baterie</span>
              <span className="block text-xs leading-relaxed text-slate-500">
                Estimare comparativă, separată de calculele standard. Nu resimulează bateria și nu modifică exportul real estimat.
              </span>
            </span>
          </label>
          {mode === "operator" && (
            <div className="grid flex-1 gap-3 sm:grid-cols-2">
              <NumberField label="Prag vârf consum (σ)" value={settings.sigma} min={0.5} step={0.1} onCommit={(v) => set("sigma", v)} />
              <NumberField label="Prag salt SOC (p.p. / 15 min)" value={settings.socJumpPct} min={0.5} step={0.5} onCommit={(v) => set("socJumpPct", v)} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function NumberField(props: {
  label: string;
  value: number;
  min?: number;
  step?: number;
  hint?: string;
  compact?: boolean;
  onCommit: (v: number) => void;
}) {
  const id = props.label.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return (
    <div className={props.compact ? "w-44" : undefined}>
      <label className="label" htmlFor={id}>
        {props.label}
      </label>
      <NumberInput id={id} value={props.value} min={props.min} step={props.step} onCommit={props.onCommit} wide />
      {props.hint && <p className="mt-1 text-xs text-slate-500">{props.hint}</p>}
    </div>
  );
}

/** Câmp numeric care acceptă punct sau virgulă și aplică valoarea doar când este validă. */
function NumberInput(props: { id: string; value: number; min?: number; step?: number; wide?: boolean; onCommit: (v: number) => void }) {
  const [text, setText] = useState(String(props.value));
  useEffect(() => {
    setText((t) => (Number(t.replace(",", ".")) === props.value ? t : String(Math.round(props.value * 1000) / 1000)));
  }, [props.value]);

  const commit = (raw: string) => {
    const v = Number(raw.replace(",", "."));
    if (raw.trim() !== "" && Number.isFinite(v) && v >= (props.min ?? -Infinity)) props.onCommit(v);
  };

  return (
    <input
      id={props.id}
      inputMode="decimal"
      className={`input ${props.wide ? "" : "w-28"}`}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        commit(e.target.value);
      }}
      onBlur={() => setText(String(Math.round(props.value * 1000) / 1000))}
    />
  );
}
