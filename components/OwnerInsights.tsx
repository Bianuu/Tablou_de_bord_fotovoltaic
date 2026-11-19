"use client";

import { useMemo } from "react";
import type { AnomalyEvent, DaySummary, IntervalCalc, Settings, Totals } from "@/lib/types";
import { ownerRecommendations } from "@/lib/recommendations";
import { fmt, fmtPct } from "@/lib/format";

interface Props {
  items: IntervalCalc[];
  days: DaySummary[];
  period: Totals;
  day: DaySummary;
  settings: Settings;
  events: AnomalyEvent[];
}

export default function OwnerInsights({ items, days, period, day, settings, events }: Props) {
  const recs = useMemo(() => ownerRecommendations(items, days, period, settings, events), [items, days, period, settings, events]);
  const t = day.totals;

  return (
    <section className="grid gap-5 lg:grid-cols-5">
      <div className="card min-w-0 lg:col-span-2">
        <h2 className="card-title mb-3">Pe scurt, în ziua de {day.label}</h2>
        <ul className="space-y-2 text-sm text-slate-700">
          <li>
            Panourile au produs <b>{fmt(t.ePv, 1)} kWh</b>, iar locația a consumat <b>{fmt(t.eLoad, 1)} kWh</b>.
          </li>
          <li>
            Import estimat din rețea: <b>{fmt(t.eImport, 1)} kWh</b>; export brut estimat: <b>{fmt(t.eExport, 1)} kWh</b>.
          </li>
          <li>
            {fmtPct(t.selfSufficiency, 0)} din consum a fost acoperit de panouri și baterie.
            {t.savingsRon !== null ? <> Economie estimată: <b>{fmt(t.savingsRon, 1)} lei</b>.</> : " Economia nu poate fi estimată fiabil."}
          </li>
          <li>
            Bateria a avut un nivel între {fmt(t.socMin, 0)}% și {fmt(t.socMax, 0)}%.
          </li>
          {t.eCurt > 0 ? (
            <li>
              Plafonul de {fmt(settings.exportCapKw, 1)} kW ar fi tăiat <b>{fmt(t.eCurt, 1)} kWh</b> ({fmtPct(t.curtPct)} din ce ați fi
              exportat).
            </li>
          ) : (
            <li>Plafonul de {fmt(settings.exportCapKw, 1)} kW nu ar fi tăiat nimic în această zi.</li>
          )}
        </ul>
        <p className="mt-3 text-xs text-slate-500">Importul, exportul și economia sunt estimări din SOC, nu citiri ale contorului. Valorile RON nu reprezintă economii garantate la factură.</p>
        {settings.simulateBattery && <BatterySimNote period={period} settings={settings} />}
      </div>

      <div className="card min-w-0 lg:col-span-3">
        <h2 className="card-title mb-3">Recomandări practice</h2>
        {recs.length === 0 ? (
          <p className="text-sm text-slate-600">Nu reiese nicio recomandare clară din aceste date.</p>
        ) : (
          <ol className="space-y-3">
            {recs.map((r, i) => (
              <li key={r.title} className="flex gap-3">
                <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                  {i + 1}
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{r.title}</p>
                  <p className="text-sm text-slate-600">{r.text}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

export function BatterySimNote({ period, settings }: { period: Totals; settings: Settings }) {
  const share = period.eCurt > 0 ? (period.eAbsorbed / period.eCurt) * 100 : 0;
  return (
    <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
      <p className="font-semibold">Simulare: surplusul tăiat redirecționat în baterie</p>
      {period.eCurt > 0 ? (
        <p className="mt-1">
          Din cei {fmt(period.eCurt, 1)} kWh tăiați de plafon în toată perioada, aproximativ <b>{fmt(period.eAbsorbed, 1)} kWh</b> (
          {fmtPct(share, 0)}) ar mai fi încăput în bateria de {fmt(settings.batteryKwh, 0)} kWh până la 100% SOC. Diferența de{" "}
          {fmt(period.eCurt - period.eAbsorbed, 1)} kWh nu ar avea loc în acest model simplificat.
        </p>
      ) : null}
      {period.eCurt > 0 && period.eCurtBatteryFull > 0 ? (
        <p className="mt-1">
          {fmt(period.eCurtBatteryFull, 1)} kWh ({fmtPct((period.eCurtBatteryFull / period.eCurt) * 100, 0)}) din energia tăiată apare în
          intervale în care bateria era deja plină (SOC ≥ 99%), deci acolo bateria nu mai are unde să o primească.
        </p>
      ) : null}
      {period.eCurt <= 0 && <p className="mt-1">Cu plafonul actual nu se taie energie, deci nu e nimic de redirecționat.</p>}
      <p className="mt-1 text-xs text-emerald-800">
        Estimare simplificată: spațiul liber din baterie la fiecare interval este (100 − SOC)% din capacitate, minus ce s-a recuperat deja în
        aceeași zi. Nu ține cont de puterea maximă de încărcare și de pierderi.
      </p>
    </div>
  );
}
