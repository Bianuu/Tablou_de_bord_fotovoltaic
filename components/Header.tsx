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
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <SunIcon />
          <div>
            <h1 className="text-lg font-semibold leading-tight">Dashboard PV Solar</h1>
            <p className="text-xs text-slate-500">Producție, consum și baterie la rezoluție de 15 minute</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Public țintă" className="flex rounded-lg border border-slate-300 bg-slate-100 p-0.5">
            <ModeButton active={mode === "proprietar"} onClick={() => onModeChange("proprietar")}>
              Mod Proprietar
            </ModeButton>
            <ModeButton active={mode === "operator"} onClick={() => onModeChange("operator")}>
              Mod Operator Tehnic
            </ModeButton>
          </div>

          {fileName && (
            <>
              <button type="button" className="btn-secondary" onClick={() => inputRef.current?.click()} disabled={loading}>
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
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
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
