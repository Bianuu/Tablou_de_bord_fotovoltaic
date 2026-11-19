const fs = require('node:fs');
const path = require('node:path');
const { loadModules, settings } = require('./common.cjs');
const file = process.argv[2];
if (!file) {
  console.error('Utilizare: npm run test:csv -- C:\\cale\\date-test.csv (sau calea Unix)');
  process.exit(2);
}
const { csv, energy, anomalies, close } = loadModules();
try {
  const parsed = csv.parseCsv(fs.readFileSync(file, 'utf8'), path.basename(file));
  const items = energy.computeIntervals(parsed.rows, settings);
  const days = energy.groupDays(items, settings);
  const t = energy.summarize(items, settings);
  const a = anomalies.detectAnomalies(items, days, settings);
  const expected = days.length * 96;
  console.log('VALIDARE CSV:', path.basename(file));
  console.log('Zile:', days.length, '| Rânduri:', parsed.rows.length, '| intervale așteptate:', expected);
  console.log('Rânduri brute suspecte, păstrate în grafice:', parsed.suspiciousRows, '| jurnal import (excluse):', parsed.rejectedRows.length, '| bilanț indisponibil:', t.excludedGridIntervals);
  console.log('Producție PV:', t.ePv.toFixed(3), 'kWh | Consum:',t.eLoad.toFixed(3),'kWh');
  console.log('Export estimat:',t.eExport.toFixed(3),'kWh | Curtailment:',t.eCurt.toFixed(3),'kWh | Plafon:',settings.exportCapKw,'kW');
  console.log('Autoconsum:',t.selfConsumption?.toFixed(2) ?? 'N/A', '% | Autosuficiență:',t.selfSufficiency?.toFixed(2) ?? 'N/A', '%');
  console.log('Evenimente anomalii:',a.events.length, '| invalid_value:',a.events.filter(e=>e.type==='invalid_value').length);
  for (const w of parsed.warnings) console.log('AVERTISMENT:',w);
  if(days.length !== 30) console.warn('ATENȚIE: fișierul nu acoperă exact 30 de zile distincte.');
  if(parsed.rows.length !== 2880) console.warn('ATENȚIE: nu sunt exact 2.880 intervale cu timestamp și valori numerice; consultă jurnalul și acoperirea.');
  if(t.excludedGridIntervals) console.warn('ATENȚIE: bilanțul de rețea este parțial; nu extrapola exportul/curtailment-ul la intervalele lipsă.');
} finally { close(); }
