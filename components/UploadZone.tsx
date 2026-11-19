"use client";

import { useRef, useState } from "react";
import { UploadIcon } from "./Header";

interface Props {
  onFile: (f: File) => void;
  loading: boolean;
  error: string | null;
}

export default function UploadZone({ onFile, loading, error }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <section className="mx-auto max-w-3xl space-y-4 py-3 sm:py-6">
      <div
        role="button"
        tabIndex={0}
        aria-label="Încarcă fișierul CSV"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-10 text-center outline-none transition focus-visible:border-sky-500 focus-visible:ring-2 focus-visible:ring-sky-300 sm:px-6 sm:py-14 ${
          over ? "border-sky-500 bg-sky-50" : "border-slate-300 bg-white hover:border-slate-400"
        }`}
      >
        <div className="mb-3 rounded-full bg-slate-100 p-3 text-slate-700">
          <UploadIcon />
        </div>
        <p className="text-lg font-semibold">{loading ? "Se citește fișierul…" : "Încarcă fișierul CSV"}</p>
        <p className="mt-1 text-sm text-slate-600">Atinge pentru a selecta CSV-ul sau trage-l aici de pe calculator</p>
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
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      <div className="card text-sm text-slate-700">
        <h2 className="card-title mb-2">Formatul așteptat</h2>
        <p>
          30 de zile la rezoluție de 15 minute (96 de intervale pe zi, 2.880 de rânduri), cu exact patru coloane. Separatorul poate fi
          virgulă, punct și virgulă sau tab.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-900 p-3 font-mono text-xs leading-relaxed text-slate-100">
{`timestamp,pv_kw,load_kw,battery_soc_pct
01-06-26 5:00,0.00,18.40,42.0
01-06-26 5:15,0.35,17.90,41.5
01-06-26 5:30,1.20,18.10,41.2`}
        </pre>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          <li>
            <span className="font-medium">timestamp</span>: DD-MM-YY H:MM (ex. 01-06-26 5:15); se acceptă și DD-MM-YYYY HH:MM și ISO
            (2026-06-01T05:15).
          </li>
          <li>
            <span className="font-medium">pv_kw</span>, <span className="font-medium">load_kw</span>: puteri instantanee în kW (punct sau
            virgulă zecimală).
          </li>
          <li>
            <span className="font-medium">battery_soc_pct</span>: starea de încărcare a bateriei, 0–100%.
          </li>
        </ul>
        <p className="mt-3 text-xs text-slate-500">Fișierul nu părăsește browserul: toate calculele se fac local.</p>
      </div>
    </section>
  );
}
