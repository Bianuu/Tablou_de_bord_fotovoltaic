"use client";

import { useEffect, useState } from "react";
import type { AnalyzePayload, AnalyzeRequest, AnalyzeResponse, AnomalyEvent, DaySummary, IntervalCalc, Mode, Provider, Settings, Totals } from "@/lib/types";
import { CLAUDE_MODELS, DEFAULT_CLAUDE_MODEL, OTHER_PROVIDERS, PROVIDER_LABELS } from "@/lib/models";
import SimpleMarkdown from "./SimpleMarkdown";

interface Props {
  mode: Mode;
  dataVersion: number;
  day: DaySummary;
  dayItems: IntervalCalc[];
  dayEvents: AnomalyEvent[];
  period: Totals;
  dayCount: number;
  settings: Settings;
}

interface ServerInfo {
  configured: Record<Provider, boolean>;
  accessCodeRequired: boolean;
}

interface Result extends AnalyzeResponse {
  dayLabel: string;
  mode: Mode;
  localAnomalies: AnomalyEvent[];
  signature: string;
}

const CUSTOM = "__custom__";

export default function AiPanel({ mode, dataVersion, day, dayItems, dayEvents, period, dayCount, settings }: Props) {
  const [server, setServer] = useState<ServerInfo | null>(null);
  const [claudeModel, setClaudeModel] = useState(DEFAULT_CLAUDE_MODEL);
  const [claudeCustom, setClaudeCustom] = useState("");
  const [claudeKey, setClaudeKey] = useState("");
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherProvider, setOtherProvider] = useState(OTHER_PROVIDERS[0].id);
  const [otherModels, setOtherModels] = useState<Record<string, string>>(
    Object.fromEntries(OTHER_PROVIDERS.map((p) => [p.id, p.defaultModel])),
  );
  const [otherKeys, setOtherKeys] = useState<Record<string, string>>({});
  const [accessCode, setAccessCode] = useState("");
  const [loading, setLoading] = useState<"claude" | "other" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    fetch("/api/analyze", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setServer(d))
      .catch(() => setServer(null));
  }, []);

  const signature = JSON.stringify({
    dataVersion, day: day.key, mode, batteryKwh: settings.batteryKwh, exportCapKw: settings.exportCapKw,
    tariffRon: settings.tariffRon, simulateBattery: settings.simulateBattery,
    sigma: settings.sigma, socJumpPct: settings.socJumpPct,
  });

  const provider = OTHER_PROVIDERS.find((p) => p.id === otherProvider)!;
  const claudeModelId = claudeModel === CUSTOM ? claudeCustom.trim() : claudeModel;
  const usesServerKey = (p: Provider, key: string) => !key.trim() && Boolean(server?.configured[p]);
  const needsCode = (p: Provider, key: string) => usesServerKey(p, key) && Boolean(server?.accessCodeRequired);

  const buildPayload = (): AnalyzePayload => ({
    mode,
    dayLabel: day.label,
    daysInPeriod: dayCount,
    settings: { batteryKwh: settings.batteryKwh, exportCapKw: settings.exportCapKw, tariffRon: settings.tariffRon },
    dayTotals: day.totals,
    periodTotals: period,
    anomalies: dayEvents.slice(0, 40).map((e) => ({ severity: e.severity, title: e.title, detail: e.detail })),
    series: dayItems
      .map((it) => `${it.time};${it.pv.toFixed(2)};${it.load.toFixed(2)};${it.soc.toFixed(1)};${it.gridReliable ? it.eGrid.toFixed(3) : "N/A"};${it.gridReliable ? it.pCurt.toFixed(2) : "N/A"};${it.energyValid ? "da" : "nu"}`)
      .join("\n"),
  });

  const run = async (target: "claude" | "other") => {
    const req: AnalyzeRequest & { accessCode?: string } =
      target === "claude"
        ? { target, provider: "anthropic", model: claudeModelId, apiKey: claudeKey.trim() || undefined, payload: buildPayload() }
        : {
            target,
            provider: provider.id,
            model: (otherModels[provider.id] ?? "").trim(),
            apiKey: (otherKeys[provider.id] ?? "").trim() || undefined,
            payload: buildPayload(),
          };
    if (!req.model) {
      setError("Alege sau scrie un model.");
      return;
    }
    if (!req.apiKey && server && !server.configured[req.provider]) {
      setError(`Introdu cheia API pentru ${PROVIDER_LABELS[req.provider]} (pe server nu este configurată nicio cheie).`);
      return;
    }
    if (!req.apiKey && server?.accessCodeRequired) req.accessCode = accessCode.trim();

    const requestSignature = signature;
    setLoading(target);
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        setError(data?.error ?? `Serverul a răspuns cu eroarea ${res.status}.`);
        return;
      }
      setResult({ ...(data as AnalyzeResponse), dayLabel: day.label, mode, localAnomalies: dayEvents, signature: requestSignature });
    } catch {
      setError("Nu am putut contacta serverul aplicației.");
    } finally {
      setLoading(null);
    }
  };

  const stale = result && result.signature !== signature;

  return (
    <section className="card" aria-label="Agent AI">
      <div className="mb-4">
        <h2 className="card-title">Agent AI · rezumat și anomalii pentru ziua {day.label}</h2>
        <p className="text-xs text-slate-500">
          Trimite KPI-urile zilei, anomaliile detectate local și seria de {dayItems.length} intervale către modelul ales. Răspunsul vine în
          română, adaptat modului {mode === "proprietar" ? "Proprietar" : "Operator Tehnic"}. Cheile se folosesc doar pentru această cerere
          și nu se salvează.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Butonul 1: exclusiv Anthropic Claude */}
        <div className="min-w-0 rounded-xl border border-[#e8c4b3] bg-[#fbf5f1] p-3 sm:p-4">
          <p className="mb-3 text-sm font-semibold text-slate-900">1 · Anthropic Claude</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="claude-model">
                Model Claude
              </label>
              <select id="claude-model" className="input" value={claudeModel} onChange={(e) => setClaudeModel(e.target.value)}>
                {CLAUDE_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
                <option value={CUSTOM}>Alt model Claude…</option>
              </select>
              {claudeModel === CUSTOM && (
                <input
                  className="input mt-2"
                  placeholder="ex. claude-opus-5-5"
                  value={claudeCustom}
                  onChange={(e) => setClaudeCustom(e.target.value)}
                  aria-label="ID model Claude"
                />
              )}
            </div>
            <KeyField
              id="claude-key"
              label="Cheie API Anthropic"
              placeholder="sk-ant-…"
              value={claudeKey}
              onChange={setClaudeKey}
              serverHasKey={Boolean(server?.configured.anthropic)}
              envVar="ANTHROPIC_API_KEY"
            />
          </div>
          {needsCode("anthropic", claudeKey) && <AccessCode value={accessCode} onChange={setAccessCode} />}
          <button type="button" className="btn-claude mt-3 w-full sm:w-auto" onClick={() => run("claude")} disabled={loading !== null}>
            {loading === "claude" ? <Spinner /> : <SparkIcon />}
            {loading === "claude" ? "Claude analizează…" : "Analizează cu Claude"}
          </button>
        </div>

        {/* Butonul 2: alți furnizori, fără Claude */}
        <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900">2 · Alți furnizori (fără Claude)</p>
            <button type="button" className="btn-secondary" onClick={() => setOtherOpen((v) => !v)} aria-expanded={otherOpen}>
              {otherOpen ? "Ascunde selectorul" : "Selectează alt LLM"}
            </button>
          </div>

          {!otherOpen ? (
            <p className="mt-3 text-sm text-slate-600">OpenAI / ChatGPT, Google Gemini sau OpenRouter, cu modelul și cheia voastră.</p>
          ) : (
            <div className="mt-3 space-y-3">
              <div role="radiogroup" aria-label="Furnizor" className="flex flex-wrap gap-2">
                {OTHER_PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={otherProvider === p.id}
                    onClick={() => setOtherProvider(p.id)}
                    className={`min-h-10 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                      otherProvider === p.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="other-model">
                    Model
                  </label>
                  <input
                    id="other-model"
                    className="input"
                    list={`models-${provider.id}`}
                    value={otherModels[provider.id] ?? ""}
                    onChange={(e) => setOtherModels((m) => ({ ...m, [provider.id]: e.target.value }))}
                  />
                  <datalist id={`models-${provider.id}`}>
                    {provider.suggestions.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                  <a href={provider.docsUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-sky-700 hover:underline">
                    Lista de modele {provider.label}
                  </a>
                </div>
                <KeyField
                  id="other-key"
                  label={`Cheie API ${provider.label}`}
                  placeholder={provider.keyPlaceholder}
                  value={otherKeys[provider.id] ?? ""}
                  onChange={(v) => setOtherKeys((k) => ({ ...k, [provider.id]: v }))}
                  serverHasKey={Boolean(server?.configured[provider.id])}
                  envVar={provider.envVar}
                />
              </div>
              {needsCode(provider.id, otherKeys[provider.id] ?? "") && <AccessCode value={accessCode} onChange={setAccessCode} />}
              <button type="button" className="btn-primary w-full sm:w-auto" onClick={() => run("other")} disabled={loading !== null}>
                {loading === "other" && <Spinner />}
                {loading === "other" ? `${provider.label} analizează…` : `Analizează cu ${provider.label}`}
              </button>
            </div>
          )}
        </div>
      </div>

      {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      {result && (
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <div className="min-w-0 rounded-xl border border-slate-200 p-3 sm:p-4 lg:col-span-2">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="chip bg-slate-900 text-white">{PROVIDER_LABELS[result.provider]}</span>
              <span className="break-all font-mono">{result.model}</span>
              <span>· ziua {result.dayLabel}</span>
              <span>· mod {result.mode === "proprietar" ? "Proprietar" : "Operator Tehnic"}</span>
            </div>
            {stale && (
              <p className="mb-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
                Analiza este învechită: fișierul, ziua, modul, plafonul, capacitatea bateriei, tariful sau pragurile de anomalii s-au modificat. Rulează din nou analiza pentru datele curente.
              </p>
            )}
            {result.notice && <p className="mb-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">{result.notice}</p>}
            <SimpleMarkdown text={result.text} />
          </div>
          <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
            <p className="mb-2 text-sm font-semibold text-slate-900">Detecție locală (deterministă)</p>
            {result.localAnomalies.length === 0 ? (
              <p className="text-sm text-slate-600">Nicio anomalie detectată local în această zi.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {result.localAnomalies.map((a, i) => (
                  <li key={i}>
                    <span className="font-medium text-slate-900">{a.title}</span>
                    <span className="block text-xs text-slate-500">{a.severity}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-slate-500">
              Aceste anomalii au fost trimise modelului ca fapte; textul din stânga adaugă interpretarea și eventualele „observații AI”.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function KeyField(props: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  serverHasKey: boolean;
  envVar: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={props.id}>
        {props.label}
      </label>
      <input
        id={props.id}
        type="password"
        autoComplete="off"
        spellCheck={false}
        className="input font-mono"
        placeholder={props.serverHasKey ? "opțional: pe server există o cheie" : props.placeholder}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
      <p className="mt-1 text-xs text-slate-500">
        {props.serverHasKey ? `Gol = se folosește ${props.envVar} de pe server.` : `Sau setați ${props.envVar} în .env.local / Vercel.`}
      </p>
    </div>
  );
}

function AccessCode({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="mt-3">
      <label className="label" htmlFor="access-code">
        Cod de acces pentru cheia de pe server
      </label>
      <input id="access-code" type="password" className="input" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Spinner() {
  return <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />;
}

function SparkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
    </svg>
  );
}
