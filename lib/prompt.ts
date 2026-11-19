import type { AnalyzePayload, Totals } from "./types";
import { fmt, fmtPct } from "./format";

/**
 * Promptul este construit pe server din datele structurate trimise de browser,
 * astfel încât instrucțiunile să fie aceleași pentru toți furnizorii.
 */
export function buildSystemPrompt(payload: AnalyzePayload): string {
  const audience =
    payload.mode === "proprietar"
      ? [
          "Cititorul este proprietarul instalației și nu are pregătire tehnică.",
          "Scrie simplu, în fraze scurte, fără formule și fără jargon. Explică orice termen tehnic pe care nu îl poți evita.",
          "Pune accent pe independența energetică, pe economia în lei și pe ce poate face concret (când să pornească consumatorii mari, ce înseamnă energia tăiată de plafonul de export).",
        ]
      : [
          "Cititorul este operatorul tehnic al instalației.",
          "Folosește terminologie tehnică și valori exacte cu unități (kW, kWh, %, p.p.), cu ora fiecărui interval relevant.",
          "Comentează bilanțul energetic, puterile de vârf, comportamentul bateriei (încărcare, descărcare, SOC minim și maxim) și impactul plafonului de export.",
          "Pentru fiecare anomalie dă intervalul, valoarea, cauza tehnică probabilă și verificarea recomandată.",
        ];

  return [
    "Ești analist de date energetice pentru o instalație fotovoltaică cu baterie, conectată la rețea.",
    "Primești datele unei singure zile la rezoluție de 15 minute, KPI-urile calculate de aplicație și anomaliile găsite de detectorul determinist al aplicației.",
    "",
    ...audience,
    "",
    "Reguli:",
    "- Răspunde numai în limba română, cu diacritice.",
    "- Folosește cifrele din KPI-uri exact cum sunt date. Nu le recalcula și nu inventa valori care nu apar în date.",
    "- Anomaliile detectate local sunt fapte. Preia-le, explică ce pot însemna și leagă-le de seria de date.",
    "- Dacă vezi în serie un tipar neobișnuit pe care detectorul nu l-a semnalat, adaugă-l și marchează-l ca „observație AI”.",
    "- Dacă datele nu permit o concluzie, spune asta în loc să ghicești.",
    "",
    "Format: Markdown simplu, cu exact trei secțiuni, în ordinea aceasta: „## Rezumat”, „## Anomalii”, „## Recomandări”.",
    "Folosește liste cu „- ” și **bold** doar pentru cifrele cheie. Fără tabele. Cel mult 350 de cuvinte.",
  ].join("\n");
}

function totalsBlock(t: Totals, tariff: number): string {
  return [
    `- Producție PV: ${fmt(t.ePv, 2)} kWh; consum: ${fmt(t.eLoad, 2)} kWh`,
    `- Import din rețea: ${fmt(t.eImport, 2)} kWh; export brut: ${fmt(t.eExport, 2)} kWh`,
    `- Baterie: încărcare ${fmt(t.eCharge, 2)} kWh, descărcare ${fmt(t.eDischarge, 2)} kWh, SOC minim ${fmt(t.socMin, 0)}%, maxim ${fmt(t.socMax, 0)}%`,
    `- Autoconsum: ${fmtPct(t.selfConsumption)}; autosuficiență: ${fmtPct(t.selfSufficiency)}`,
    `- Energie tăiată de plafon (curtailment): ${fmt(t.eCurt, 2)} kWh (${fmtPct(t.curtPct)} din exportul brut), export efectiv ${fmt(t.eExportEffective, 2)} kWh, în ${t.curtailedIntervals} intervale`,
    `- Puteri de vârf: PV ${fmt(t.peakPv, 2)} kW (${t.peakPvAt}), consum ${fmt(t.peakLoad, 2)} kW (${t.peakLoadAt}), export ${fmt(t.peakExport, 2)} kW (${t.peakExportAt}), import ${fmt(t.peakImport, 2)} kW (${t.peakImportAt})`,
    `- Economie estimată: ${fmt(t.savingsRon, 2)} RON (energie consumată fără import × ${fmt(tariff, 2)} RON/kWh)`,
  ].join("\n");
}

export function buildUserPrompt(p: AnalyzePayload): string {
  const anomalies = p.anomalies.length
    ? p.anomalies.map((a) => `- [${a.severity}] ${a.title}: ${a.detail}`).join("\n")
    : "- niciuna";
  return [
    `Ziua analizată: ${p.dayLabel}`,
    `Mod de prezentare: ${p.mode === "proprietar" ? "Proprietar" : "Operator Tehnic"}`,
    `Setări: capacitate baterie ${fmt(p.settings.batteryKwh, 1)} kWh, plafon de export ${fmt(p.settings.exportCapKw, 2)} kW, tarif ${fmt(p.settings.tariffRon, 2)} RON/kWh`,
    "",
    "Cum calculează aplicația (Δt = 0,25 h):",
    "E_pv = pv_kw·0,25; E_load = load_kw·0,25; ΔE_bat = (SOC(t) − SOC(t−1))/100 · capacitate (+ încărcare, − descărcare);",
    "E_grid = E_pv − E_load − ΔE_bat (+ export, − import); P_curtailed = max(0, max(0, E_grid/0,25) − plafon).",
    "Curtailment-ul se calculează pe profilul bateriei exact cum e în fișier, fără resimulare.",
    "",
    "KPI ziua selectată:",
    totalsBlock(p.dayTotals, p.settings.tariffRon),
    "",
    `KPI pentru întreaga perioadă (${p.daysInPeriod} zile), pentru comparație:`,
    totalsBlock(p.periodTotals, p.settings.tariffRon),
    "",
    "Anomalii detectate local în ziua selectată:",
    anomalies,
    "",
    "Seria zilei (ora;pv_kw;load_kw;soc_pct;e_grid_kwh;curtailed_kw):",
    p.series,
  ].join("\n");
}
