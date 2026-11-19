"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Mode, ParseResult, Settings } from "@/lib/types";
import { CsvError, parseCsv } from "@/lib/csv";
import { computeIntervals, groupDays, maxExportPower, summarize } from "@/lib/energy";
import { detectAnomalies } from "@/lib/anomalies";
import Header from "./Header";
import UploadZone from "./UploadZone";
import SettingsPanel from "./SettingsPanel";
import DaySelector from "./DaySelector";
import KpiSection from "./KpiSection";
import DailyChart from "./DailyChart";
import MonthlyChart from "./MonthlyChart";
import OwnerInsights from "./OwnerInsights";
import OperatorDetails from "./OperatorDetails";
import AnomalyList from "./AnomalyList";
import TelemetryTable from "./TelemetryTable";
import AiPanel from "./AiPanel";

const DEFAULT_SETTINGS: Settings = {
  batteryKwh: 100,
  exportCapKw: 50,
  tariffRon: 1.3,
  simulateBattery: false,
  sigma: 3.2,
  socJumpPct: 15,
};

export default function Dashboard() {
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [mode, setMode] = useState<Mode>("proprietar");
  const [dayIdx, setDayIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setLoading(true);
      setLoadError(null);
      try {
        const text = await file.text();
        const result = parseCsv(text, file.name);
        // Plafonul implicit: 70% din cea mai mare putere de export din fișier, ca să se vadă efectul.
        const peak = maxExportPower(computeIntervals(result.rows, { ...settings, simulateBattery: false }));
        const cap = peak > 0 ? Math.max(0.1, Math.round(peak * 0.7 * 10) / 10) : settings.exportCapKw;
        setSettings((s) => ({ ...s, exportCapKw: cap }));
        setParsed(result);
        setDataVersion((v) => v + 1);
        setDayIdx(0);
      } catch (e) {
        setLoadError(e instanceof CsvError ? e.message : `Fișierul nu a putut fi citit: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setLoading(false);
      }
    },
    [settings],
  );

  const intervals = useMemo(() => (parsed ? computeIntervals(parsed.rows, settings) : []), [parsed, settings]);
  const days = useMemo(() => groupDays(intervals, settings), [intervals, settings]);
  const anomalies = useMemo(() => detectAnomalies(intervals, days, settings), [intervals, days, settings]);
  const period = useMemo(() => summarize(intervals, settings), [intervals, settings]);
  const maxExport = useMemo(() => maxExportPower(intervals), [intervals]);

  useEffect(() => {
    if (dayIdx > days.length - 1) setDayIdx(Math.max(0, days.length - 1));
  }, [days.length, dayIdx]);

  const day = days[Math.min(dayIdx, Math.max(0, days.length - 1))];
  const dayItems = useMemo(() => (day ? intervals.slice(day.start, day.end + 1) : []), [intervals, day]);
  const dayEvents = useMemo(() => (day ? anomalies.events.filter((e) => e.dayKey === day.key) : []), [anomalies, day]);

  return (
    <div className="min-h-screen">
      <Header mode={mode} onModeChange={setMode} fileName={parsed?.fileName} onFile={handleFile} loading={loading} />

      <main id="main-content" className="mx-auto max-w-7xl space-y-4 px-3 py-4 sm:space-y-5 sm:px-6 sm:py-6">
        {!parsed || !day ? (
          <UploadZone onFile={handleFile} loading={loading} error={loadError} />
        ) : (
          <>
            {loadError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{loadError}</div>
            )}
            <FileInfo parsed={parsed} days={days.length} intervals={intervals.length} />
            {period.excludedGridIntervals > 0 && (
              <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                <strong>Acoperire parțială a bilanțului:</strong> {period.excludedGridIntervals} din {period.intervals} intervale au
                bilanțul rețelei și curtailment-ul necalculabile din cauza valorilor suspecte, a SOC precedent suspect sau a
                golurilor în măsurători. KPI-urile procentuale și exportul folosesc doar cele {period.gridIntervals} intervale
                calculabile; producția/consumul însumează doar măsurătorile fără valori fizic suspecte.
                Nu extrapolăm peste datele indisponibile.
              </div>
            )}
            {period.invalidIntervals > 0 && (
              <div role="alert" className="rounded-lg border border-orange-300 bg-orange-50 px-4 py-3 text-sm text-orange-950">
                <strong>Valori brute suspecte, păstrate în fișier:</strong> {period.invalidIntervals} intervale sunt vizibile
                nemodificate în grafic și tabel și marcate ca anomalii. Aceste intervale sunt excluse din TOATE KPI-urile
                (inclusiv producție, consum și statistici). Intervalul următor poate avea și bilanțul rețelei indisponibil,
                dacă SOC din rândul suspect este invalid. Consultă tabelul telemetric și secțiunea Anomalii.
              </div>
            )}
            {(period.selfConsumptionRaw !== null && period.selfConsumption === null ||
              period.selfSufficiencyRaw !== null && period.selfSufficiency === null) && (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
                Datele și capacitatea bateriei alese produc procente în afara intervalului fizic 0–100%.
                KPI-urile afectate sunt marcate indisponibile; verificați capacitatea bateriei și profilul SOC.
              </div>
            )}

            <nav className="mobile-scroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:hidden" aria-label="Navigare rapidă prin dashboard">
              {[
                ["#period-kpis", "KPI"],
                ["#daily-plot", "Grafice"],
                ["#anomaly-events", "Anomalii"],
                ["#ai-report", "Agent AI"],
              ].map(([href, text]) => (
                <a key={href} href={href} className="inline-flex min-h-10 shrink-0 items-center rounded-full border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500">
                  {text}
                </a>
              ))}
            </nav>

            <SettingsPanel settings={settings} onChange={setSettings} maxExport={maxExport} mode={mode} />

            <DaySelector days={days} dayIdx={dayIdx} onChange={setDayIdx} />

            <div id="period-kpis" className="scroll-mt-4"><KpiSection mode={mode} period={period} day={day.totals} dayLabel={day.label} dayCount={days.length} settings={settings} /></div>

            <div id="daily-plot" className="scroll-mt-4"><DailyChart items={dayItems} dayLabel={day.label} settings={settings} mode={mode} /></div>

            <MonthlyChart days={days} dayIdx={dayIdx} onSelect={setDayIdx} simulate={settings.simulateBattery} />

            {mode === "proprietar" ? (
              <OwnerInsights items={intervals} days={days} period={period} day={day} settings={settings} events={anomalies.events} />
            ) : (
              <OperatorDetails period={period} day={day} settings={settings} anomalies={anomalies} dayCount={days.length} />
            )}

            <div id="anomaly-events" className="scroll-mt-4"><AnomalyList mode={mode} dayEvents={dayEvents} allEvents={anomalies.events} dayLabel={day.label} /></div>

            <TelemetryTable items={intervals} flags={anomalies.flags} day={day} />

            <div id="ai-report" className="scroll-mt-4"><AiPanel
              mode={mode}
              dataVersion={dataVersion}
              day={day}
              dayItems={dayItems}
              dayEvents={dayEvents}
              period={period}
              dayCount={days.length}
              settings={settings}
            /></div>
          </>
        )}
      </main>

      <footer className="mx-auto max-w-7xl px-4 pb-8 pt-2 text-xs leading-relaxed text-slate-500 sm:px-6">
        Datele CSV sunt procesate integral în browser. Spre server pleacă doar datele zilei selectate, la apăsarea unui buton de
        analiză AI; cheile API nu se salvează.
      </footer>
    </div>
  );
}

function FileInfo({ parsed, days, intervals }: { parsed: ParseResult; days: number; intervals: number }) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-600">
        <span className="break-all font-medium text-slate-800">{parsed.fileName}</span> · {intervals.toLocaleString("ro-RO")} intervale în{" "}
        {days} zile · format dată {parsed.timestampFormat} · separator „{parsed.delimiter}”
      </p>
      <p className="text-xs text-slate-500">
        Exportul și importul sunt estimate din SOC și capacitatea bateriei introdusă (implicit 100 kWh), fără pierderi.
        Primul interval presupune ΔSOC=0; un interval lipsă nu este interpolat. Valorile brute suspecte sunt păstrate,
        dar excluse din KPI-uri și semnalate separat.
      </p>
      {parsed.rejectedRows.length > 0 && (
        <details className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <summary className="cursor-pointer font-semibold">
            Jurnal CSV brut: {parsed.rejectedRows.length} rânduri neutilizate în calcule (date neinterpretabile / duplicate)
          </summary>
          <p className="mt-2 text-xs">
            Textul fiecărui rând este păstrat exact cum a fost citit, fără corectări. Aceste înregistrări nu se pot
            reprezenta toate ca intervale unice în grafic; nu contribuie la niciun KPI.
          </p>
          <div className="mt-3 max-h-64 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead><tr><th className="p-2">Linia</th><th className="p-2">Motiv</th><th className="p-2">Conținut CSV original</th></tr></thead>
              <tbody>
                {parsed.rejectedRows.map((r) => (
                  <tr key={r.line} className="border-t border-amber-200">
                    <td className="p-2">{r.line}</td><td className="p-2">{r.reason}</td>
                    <td className="break-all p-2 font-mono">{r.rawLine}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      {parsed.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          {parsed.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      )}
    </div>
  );
}
