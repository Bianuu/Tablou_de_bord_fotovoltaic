import type { AnomalyEvent, DaySummary, IntervalCalc, Settings, Totals } from "./types";
import { capForCurtailmentBelow } from "./energy";
import { fmt, fmtPct } from "./format";

export interface Recommendation {
  title: string;
  text: string;
}

/** Media pe oră a exportului și importului (kWh pe zi, pentru fiecare oră 0–23). */
function hourlyProfile(items: IntervalCalc[], dayCount: number) {
  const exp = new Array(24).fill(0);
  const imp = new Array(24).fill(0);
  for (const it of items) {
    const h = Math.floor(it.minutes / 60);
    exp[h] += it.eExport;
    imp[h] += it.eImport;
  }
  const n = Math.max(1, dayCount);
  return { exp: exp.map((v) => v / n), imp: imp.map((v) => v / n) };
}

/** Fereastra de `len` ore consecutive cu cea mai mare sumă. */
function bestWindow(values: number[], len: number) {
  let best = 0;
  let bestStart = 0;
  for (let s = 0; s + len <= values.length; s++) {
    let sum = 0;
    for (let k = 0; k < len; k++) sum += values[s + k];
    if (sum > best) {
      best = sum;
      bestStart = s;
    }
  }
  return { start: bestStart, end: bestStart + len, sum: best };
}

const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

/**
 * Recomandări practice pentru proprietar, derivate direct din date (fără AI).
 * Fiecare regulă se aplică doar dacă datele o susțin.
 */
export function ownerRecommendations(
  items: IntervalCalc[],
  days: DaySummary[],
  period: Totals,
  settings: Settings,
  events: AnomalyEvent[],
): Recommendation[] {
  const recs: Recommendation[] = [];
  if (!items.length) return recs;
  const profile = hourlyProfile(items, days.length);

  // 1. Când este surplus: mutarea consumatorilor mari.
  const exportWin = bestWindow(profile.exp, 3);
  if (exportWin.sum > 0.5) {
    recs.push({
      title: "Porniți consumatorii mari la prânz",
      text: `Între ${hh(exportWin.start)} și ${hh(exportWin.end)} trimiteți în rețea în medie ${fmt(exportWin.sum)} kWh pe zi. Mutarea unor consumatori (boiler, mașină de spălat, încărcare auto) în acest interval poate utiliza mai mult din surplusul propriu.`,
    });
  }

  // 2. Când se cumpără cel mai mult din rețea.
  const importWin = bestWindow(profile.imp, 3);
  if (importWin.sum > 0.5) {
    recs.push({
      title: "Reduceți consumul în orele cu import",
      text: `Cel mai mult cumpărați din rețea între ${hh(importWin.start)} și ${hh(importWin.end)} (în medie ${fmt(importWin.sum)} kWh pe zi). Ce se poate amâna din acest interval spre orele cu soare scade factura.`,
    });
  }

  // 3. Plafonul de export taie producție.
  if (period.eCurt > 0) {
    const daysCut = days.filter((d) => d.totals.eCurt > 0).length;
    const capNone = period.peakExport;
    const cap1 = capForCurtailmentBelow(items, 1);
    recs.push({
      title: "Plafonul de export taie din producție",
      text: `Cu plafonul de ${fmt(settings.exportCapKw)} kW s-ar pierde ${fmt(period.eCurt)} kWh (${fmtPct(period.curtPct)} din export) în ${daysCut} din ${days.length} zile. Un plafon de ${fmt(Math.ceil(cap1 * 10) / 10)} kW ar ține pierderea sub 1%, iar de la ${fmt(Math.ceil(capNone * 10) / 10)} kW nu s-ar mai tăia nimic. Alternativ, consumul pornit la prânz absoarbe din surplusul tăiat.`,
    });
  }

  // 4. Bateria se umple devreme.
  // items conține DOAR intervalele din filtrul activ; indecșii din DaySummary sunt globali.
  // Folosim cheia zilei, astfel încât recomandările să rămână corecte și pentru ultimele 7/14 zile.
  const earlyFullKeys = new Set(items.filter((it) => it.energyValid && it.minutes < 13 * 60 && it.soc >= 99).map((it) => it.dayKey));
  const fullEarly = days.filter((d) => earlyFullKeys.has(d.key)).length;
  if (fullEarly > 0) {
    recs.push({
      title: "Bateria se umple înainte de ora 13",
      text: `În ${fullEarly} din ${days.length} zile bateria a atins cel puțin 99% înainte de ora 13:00. Dacă există surplus după acel moment, mutarea unor consumuri în orele însorite ar putea reduce exportul sau energia tăiată.`,
    });
  }

  // 5. Bateria se golește.
  const emptied = days.filter((d) => d.totals.socMin <= 10).length;
  if (emptied > 0) {
    recs.push({
      title: "Bateria ajunge aproape descărcată",
      text: `În ${emptied} din ${days.length} zile, bateria coboară la 10% sau mai puțin. Verificați când apare consumul din rețea și dacă îl puteți muta în orele cu producție.`,
    });
  }

  // 6. Producție zero la prânz.
  const pvDays = Array.from(new Set(events.filter((e) => e.type === "pv_zero_peak").map((e) => e.dayLabel)));
  if (pvDays.length > 0) {
    recs.push({
      title: "Verificați invertorul",
      text: `Producția a fost zero în intervale de prânz în ${pvDays.length === 1 ? "ziua" : "zilele"} ${pvDays.slice(0, 5).join(", ")}${pvDays.length > 5 ? " …" : ""}. Verificați mai întâi dacă au existat lucrări, umbrire sau opriri programate; dacă nu, consultați invertorul.`,
    });
  }

  return recs.slice(0, 6);
}

/** O frază despre independența energetică, pentru cardul principal din modul Proprietar. */
export function independenceSentence(t: Totals): string {
  if (t.selfSufficiency === null) return "Autosuficiența nu se poate estima fiabil din datele și capacitatea bateriei selectate.";
  const pct = t.selfSufficiency;
  let verdict = "";
  if (pct >= 80) verdict = "Sunteți aproape independent de rețea.";
  else if (pct >= 50) verdict = "Mai mult de jumătate din energie o produceți singur.";
  else if (pct >= 25) verdict = "Panourile și bateria acoperă o parte importantă din consum.";
  else verdict = "Cea mai mare parte a energiei vine încă din rețea.";
  return `${fmtPct(pct, 0)} din energia consumată a venit din panouri și baterie. ${verdict}`;
}
