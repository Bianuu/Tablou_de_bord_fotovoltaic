"use client";

import { useRef } from "react";
import type { Mode } from "@/lib/types";

interface Props {
  mode: Mode;
  onModeChange: (m: Mode) => void;
  fileName?: string;
  onFile: (f: File) => void;
  loading: boolean;
}

export default function Header({ mode, onModeChange, fileName, onFile, loading }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <header className="relative z-20 border-b border-slate-200 bg-white/95 backdrop-blur lg:sticky lg:top-0">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="shrink-0"><SunIcon /></div>
          <div className="min-w-0">
            <h1 className="text-base font-semibold leading-tight sm:text-lg">Dashboard PV Solar</h1>
            <p className="text-[11px] leading-snug text-slate-500 sm:text-xs">Producție, consum și baterie · intervale de 15 minute</p>
          </div>
        </div>

        <div className="grid w-full min-w-0 grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
          <div role="radiogroup" aria-label="Public țintă" className="grid w-full grid-cols-2 rounded-lg border border-slate-300 bg-slate-100 p-0.5 sm:flex sm:w-auto">
            <ModeButton active={mode === "proprietar"} onClick={() => onModeChange("proprietar")}>
              Mod Proprietar
            </ModeButton>
            <ModeButton active={mode === "operator"} onClick={() => onModeChange("operator")}>
              Mod Operator Tehnic
            </ModeButton>
          </div>

          {fileName && (
            <>
              <button type="button" className="btn-secondary w-full sm:w-auto" onClick={() => inputRef.current?.click()} disabled={loading}>
                <UploadIcon />
                {loading ? "Se încarcă…" : "Încarcă alt CSV"}
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                  e.target.value = "";
                }}
              />
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`min-h-11 rounded-md px-2 py-2 text-xs font-medium leading-tight transition sm:px-3 sm:text-sm ${
        active ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
      }`}
    >
      {children}
    </button>
  );
}

function SunIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true" className="text-pv">
      <circle cx="12" cy="12" r="4.5" fill="currentColor" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <line
          key={a}
          x1="12"
          y1="2.5"
          x2="12"
          y2="5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          transform={`rotate(${a} 12 12)`}
        />
      ))}
    </svg>
  );
}

export function UploadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
