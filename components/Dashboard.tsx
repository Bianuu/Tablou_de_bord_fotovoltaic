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
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(0);
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
        // Păstrăm plafonul ales de utilizator (implicit 50 kW), fără un prag automat înșelător.
        // Nu schimbăm setările la încărcarea unui alt fișier.
        const initialIntervals = computeIntervals(result.rows, { ...settings, simulateBattery: false });
        const initialDays = groupDays(initialIntervals, settings);

        setParsed(result);
        setDataVersion((v) => v + 1);
        setRangeStart(0);
        setRangeEnd(Math.max(0, initialDays.length - 1));
        setDayIdx(0);
      } catch (e) {
        setLoadError(
          e instanceof CsvError
            ? e.message
            : `Fișierul nu a putut fi citit: ${e instanceof Error ? e.message : String(e)}`,
        );
      } finally {
        setLoading(false);
      }
    },
    [settings],
  );

  // Calcule pe întreaga perioadă din CSV (păstrează continuitatea ΔSOC la miezul nopții și contextul global).
  const fullIntervals = useMemo(() => (parsed ? computeIntervals(parsed.rows, settings) : []), [parsed, settings]);
  const fullDays = useMemo(() => groupDays(fullIntervals, settings), [fullIntervals, settings]);
  const fullAnomalies = useMemo(
    () => detectAnomalies(fullIntervals, fullDays, settings),
    [fullIntervals, fullDays, settings],
  );
  const fullPeriod = useMemo(() => summarize(fullIntervals, settings), [fullIntervals, settings]);
  const maxExport = useMemo(() => maxExportPower(fullIntervals), [fullIntervals]);

  // Limite sigure pentru intervalul selectat.
  const safeRangeStart = Math.min(rangeStart, Math.max(0, fullDays.length - 1));
  const safeRangeEnd = Math.min(Math.max(safeRangeStart, rangeEnd), Math.max(0, fullDays.length - 1));
  const isFiltered = fullDays.length > 0 && (safeRangeStart > 0 || safeRangeEnd < fullDays.length - 1);

  const rangeDays = useMemo(
    () => fullDays.slice(safeRangeStart, safeRangeEnd + 1),
    [fullDays, safeRangeStart, safeRangeEnd],
  );

  const rangeIntervals = useMemo(() => {
    if (!isFiltered || rangeDays.length === 0) return fullIntervals;
    const startIdx = rangeDays[0].start;
    const endIdx = rangeDays[rangeDays.length - 1].end;
    return fullIntervals.slice(startIdx, endIdx + 1);
  }, [isFiltered, rangeDays, fullIntervals]);

  const rangePeriod = useMemo(
    () => (isFiltered ? summarize(rangeIntervals, settings) : fullPeriod),
    [isFiltered, rangeIntervals, settings, fullPeriod],
  );

  const rangeDayKeys = useMemo(() => new Set(rangeDays.map((d) => d.key)), [rangeDays]);
  const rangeAnomalies = useMemo(
    () =>
      isFiltered
        ? { ...fullAnomalies, events: fullAnomalies.events.filter((e) => rangeDayKeys.has(e.dayKey)) }
        : fullAnomalies,
    [isFiltered, fullAnomalies, rangeDayKeys],
  );

  useEffect(() => {
    if (dayIdx > rangeDays.length - 1) setDayIdx(Math.max(0, rangeDays.length - 1));
  }, [rangeDays.length, dayIdx]);

  const handleRangeChange = useCallback(
    (newStart: number, newEnd: number) => {
      const currentDay = rangeDays[Math.min(dayIdx, Math.max(0, rangeDays.length - 1))];
      setRangeStart(newStart);
      setRangeEnd(newEnd);
      if (currentDay) {
        const nextDays = fullDays.slice(newStart, newEnd + 1);
        const preservedIdx = nextDays.findIndex((d) => d.key === currentDay.key);
        setDayIdx(preservedIdx >= 0 ? preservedIdx : 0);
      } else {
        setDayIdx(0);
      }
    },
    [rangeDays, dayIdx, fullDays],
  );

  const day = rangeDays[Math.min(dayIdx, Math.max(0, rangeDays.length - 1))];
  const dayItems = useMemo(
    () => (day ? fullIntervals.slice(day.start, day.end + 1) : []),
    [fullIntervals, day],
  );
  const dayEvents = useMemo(
    () => (day ? fullAnomalies.events.filter((e) => e.dayKey === day.key) : []),
    [fullAnomalies, day],
  );

  const rangeLabel =
    rangeDays.length > 0
      ? rangeDays.length === 1
        ? rangeDays[0].label
        : `${rangeDays[0].label} – ${rangeDays[rangeDays.length - 1].label}`
      : "";

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
            <FileInfo parsed={parsed} days={fullDays.length} intervals={fullIntervals.length} />
            {fullPeriod.excludedGridIntervals > 0 && (
              <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                <strong>Acoperire parțială a bilanțului:</strong> {fullPeriod.excludedGridIntervals} din{" "}
                {fullPeriod.intervals} intervale au bilanțul rețelei și curtailment-ul necalculabile din cauza valorilor
                suspecte, a SOC precedent suspect sau a golurilor în măsurători. KPI-urile procentuale și exportul folosesc
                doar cele {fullPeriod.gridIntervals} intervale calculabile; producția/consumul însumează doar măsurătorile
                fără valori fizic suspecte. Nu extrapolăm peste datele indisponibile.
              </div>
            )}
            {fullPeriod.invalidIntervals > 0 && (
              <div role="alert" className="rounded-lg border border-orange-300 bg-orange-50 px-4 py-3 text-sm text-orange-950">
                <strong>Valori brute suspecte, păstrate în fișier:</strong> {fullPeriod.invalidIntervals} intervale sunt
                vizibile nemodificate în grafic și tabel și marcate ca anomalii. Aceste intervale sunt excluse din TOATE
                KPI-urile (inclusiv producție, consum și statistici). Intervalul următor poate avea și bilanțul rețelei
                indisponibil, dacă SOC din rândul suspect este invalid. Consultă tabelul telemetric și secțiunea Anomalii.
              </div>
            )}
            {((fullPeriod.selfConsumptionRaw !== null && fullPeriod.selfConsumption === null) ||
              (fullPeriod.selfSufficiencyRaw !== null && fullPeriod.selfSufficiency === null)) && (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
                Datele și capacitatea bateriei alese produc procente în afara intervalului fizic 0–100%. KPI-urile afectate
                sunt marcate indisponibile; verificați capacitatea bateriei și profilul SOC.
              </div>
            )}

            <nav
              className="mobile-scroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:hidden"
              aria-label="Navigare rapidă prin dashboard"
            >
              {[
                ["#period-kpis", "KPI"],
                ["#daily-plot", "Grafice"],
                ["#anomaly-events", "Anomalii"],
                ...(mode === "operator" ? [["#telemetry", "Telemetrie"]] : []),
                ["#ai-report", "Agent AI"],
              ].map(([href, text]) => (
                <a
                  key={href}
                  href={href}
                  className="inline-flex min-h-10 shrink-0 items-center rounded-full border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500"
                >
                  {text}
                </a>
              ))}
            </nav>

            <SettingsPanel settings={settings} onChange={setSettings} maxExport={maxExport} mode={mode} />

            <DaySelector
              allDays={fullDays}
              rangeStart={safeRangeStart}
              rangeEnd={safeRangeEnd}
              onRangeChange={handleRangeChange}
              days={rangeDays}
              dayIdx={dayIdx}
              onChange={setDayIdx}
              mode={mode}
            />

            <div id="period-kpis" className="scroll-mt-4">
              <KpiSection
                mode={mode}
                period={rangePeriod}
                fullPeriod={fullPeriod}
                fullDayCount={fullDays.length}
                isFiltered={isFiltered}
                rangeLabel={rangeLabel}
                day={day.totals}
                dayLabel={day.label}
                dayCount={rangeDays.length}
                settings={settings}
              />
            </div>

            <div id="daily-plot" className="scroll-mt-4">
              <DailyChart items={dayItems} dayLabel={day.label} settings={settings} mode={mode} />
            </div>

            <MonthlyChart days={rangeDays} dayIdx={dayIdx} onSelect={setDayIdx} simulate={settings.simulateBattery} />

            {mode === "proprietar" ? (
              <OwnerInsights
                items={rangeIntervals}
                days={rangeDays}
                period={rangePeriod}
                day={day}
                settings={settings}
                events={rangeAnomalies.events}
              />
            ) : (
              <OperatorDetails
                period={rangePeriod}
                day={day}
                settings={settings}
                anomalies={rangeAnomalies}
                dayCount={rangeDays.length}
              />
            )}

            <div id="anomaly-events" className="scroll-mt-4">
              <AnomalyList mode={mode} dayEvents={dayEvents} allEvents={fullAnomalies.events} dayLabel={day.label} />
            </div>

            {mode === "operator" && (
              <div id="telemetry" className="scroll-mt-4">
                <TelemetryTable items={fullIntervals} flags={fullAnomalies.flags} day={day} />
              </div>
            )}

            <div id="ai-report" className="scroll-mt-4">
              <AiPanel
                mode={mode}
                dataVersion={dataVersion}
                day={day}
                dayItems={dayItems}
                dayEvents={dayEvents}
                period={fullPeriod}
                dayCount={fullDays.length}
                settings={settings}
              />
            </div>
          </>
        )}
      </main>

      <footer className="mx-auto max-w-7xl px-4 pb-8 pt-2 text-xs leading-relaxed text-slate-500 sm:px-6">
        Datele CSV sunt procesate integral în browser. La apăsarea unui buton AI sunt trimise spre server datele zilei,
        KPI-urile și anomaliile pentru comparație. Cheile API introduse nu sunt stocate; folosiți conexiuni de încredere.
      </footer>
    </div>
  );
}

function FileInfo({ parsed, days, intervals }: { parsed: ParseResult; days: number; intervals: number }) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-600">
        <span className="break-all font-medium text-slate-800">{parsed.fileName}</span> ·{" "}
        {intervals.toLocaleString("ro-RO")} intervale în {days} zile · format dată {parsed.timestampFormat} · separator
        „{parsed.delimiter}”
      </p>
      <p className="text-xs text-slate-500">
        Exportul și importul sunt estimate din SOC și capacitatea bateriei introdusă (implicit 100 kWh), fără pierderi.
        Primul interval presupune ΔSOC=0; un interval lipsă nu este interpolat. Valorile brute suspecte sunt păstrate, dar
        excluse din KPI-uri și semnalate separat.
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
              <thead>
                <tr>
                  <th className="p-2">Linia</th>
                  <th className="p-2">Motiv</th>
                  <th className="p-2">Conținut CSV original</th>
                </tr>
              </thead>
              <tbody>
                {parsed.rejectedRows.map((r) => (
                  <tr key={r.line} className="border-t border-amber-200">
                    <td className="p-2">{r.line}</td>
                    <td className="p-2">{r.reason}</td>
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