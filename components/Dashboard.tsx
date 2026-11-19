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

      <main className="mx-auto max-w-7xl space-y-5 px-3 py-5 sm:px-6">
        {!parsed || !day ? (
          <UploadZone onFile={handleFile} loading={loading} error={loadError} />
        ) : (
          <>
            {loadError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{loadError}</div>
            )}
            <FileInfo parsed={parsed} days={days.length} intervals={intervals.length} />

            <SettingsPanel settings={settings} onChange={setSettings} maxExport={maxExport} mode={mode} />

            <DaySelector days={days} dayIdx={dayIdx} onChange={setDayIdx} />

            <KpiSection mode={mode} period={period} day={day.totals} dayLabel={day.label} dayCount={days.length} settings={settings} />

            <DailyChart items={dayItems} dayLabel={day.label} settings={settings} mode={mode} />

            <MonthlyChart days={days} dayIdx={dayIdx} onSelect={setDayIdx} simulate={settings.simulateBattery} />

            {mode === "proprietar" ? (
              <OwnerInsights items={intervals} days={days} period={period} day={day} settings={settings} events={anomalies.events} />
            ) : (
              <OperatorDetails period={period} day={day} settings={settings} anomalies={anomalies} dayCount={days.length} />
            )}

            <AnomalyList mode={mode} dayEvents={dayEvents} allEvents={anomalies.events} dayLabel={day.label} />

            {mode === "operator" && <TelemetryTable items={intervals} flags={anomalies.flags} day={day} />}

            <AiPanel
              mode={mode}
              day={day}
              dayItems={dayItems}
              dayEvents={dayEvents}
              period={period}
              dayCount={days.length}
              settings={settings}
            />
          </>
        )}
      </main>

      <footer className="mx-auto max-w-7xl px-3 pb-8 pt-2 text-xs text-slate-500 sm:px-6">
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
        <span className="font-medium text-slate-800">{parsed.fileName}</span> · {intervals.toLocaleString("ro-RO")} intervale în{" "}
        {days} zile · format dată {parsed.timestampFormat} · separator „{parsed.delimiter}”
      </p>
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
