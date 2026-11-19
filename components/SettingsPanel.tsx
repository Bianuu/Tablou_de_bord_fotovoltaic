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

  return (
    <section className="card">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <NumberField
          label="Capacitate baterie (kWh)"
          value={settings.batteryKwh}
          min={0}
          step={1}
          onCommit={(v) => set("batteryKwh", v)}
          hint="Transformă variația SOC (%) în energie: ΔE = ΔSOC/100 × capacitate."
        />

        <div className="lg:col-span-2">
          <label className="label" htmlFor="cap-number">
            Plafon de export (kW)
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              aria-label="Plafon de export (kW)"
              min={0}
              max={sliderMax}
              step={step}
              value={Math.min(settings.exportCapKw, sliderMax)}
              onChange={(e) => set("exportCapKw", Number(e.target.value))}
              className="h-2 w-full cursor-pointer accent-curt"
            />
            <NumberInput id="cap-number" value={settings.exportCapKw} min={0} step={step} onCommit={(v) => set("exportCapKw", v)} />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Puterea maximă de export din fișier: {fmt(maxExport, 2)} kW. Peste plafon, puterea exportată se consideră tăiată.
          </p>
        </div>

        <NumberField
          label="Tarif energie (RON/kWh)"
          value={settings.tariffRon}
          min={0}
          step={0.01}
          onCommit={(v) => set("tariffRon", v)}
          hint="Prețul energiei cumpărate din rețea; folosit pentru economia estimată."
        />
      </div>

      <div className="mt-4 flex flex-wrap items-start gap-x-8 gap-y-4 border-t border-slate-100 pt-4">
        <label className="flex max-w-xl cursor-pointer items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.simulateBattery}
            onChange={(e) => set("simulateBattery", e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-absorb"
          />
          <span>
            <span className="font-medium">Simulează redistribuire surplus tăiat în baterie</span>
            <span className="block text-xs text-slate-500">
              Calcul comparativ: cât din energia tăiată de plafon ar mai fi încăput în baterie până la 100% SOC. Datele din fișier nu se
              modifică.
            </span>
          </span>
        </label>

        {mode === "operator" && (
          <div className="flex flex-wrap gap-4">
            <NumberField
              label="Prag vârf consum (σ)"
              value={settings.sigma}
              min={0.5}
              step={0.1}
              onCommit={(v) => set("sigma", v)}
              compact
            />
            <NumberField
              label="Prag salt SOC (p.p. / 15 min)"
              value={settings.socJumpPct}
              min={0.5}
              step={0.5}
              onCommit={(v) => set("socJumpPct", v)}
              compact
            />
          </div>
        )}
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
