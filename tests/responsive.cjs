const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const root = join(__dirname, '..');
function src(file) { return readFileSync(join(root, file), 'utf8'); }
const checks = [
  ['navigație pe mobil', src('components/Dashboard.tsx').includes('Navigare rapidă prin dashboard')],
  ['moduri responsive', src('components/Header.tsx').includes('grid-cols-2') && src('components/Header.tsx').includes('lg:sticky')],
  ['plafon accesibil imediat', src('components/SettingsPanel.tsx').includes('Plafon maxim permis') && src('components/SettingsPanel.tsx').includes('aria-expanded={advancedOpen}')],
  ['selectare zi pe mobil', src('components/DaySelector.tsx').includes('grid grid-cols-2')],
  ['grilă KPI adaptivă', src('components/KpiSection.tsx').includes('max-[359px]:grid-cols-1')],
  ['grafic zilnic derulabil', src('components/DailyChart.tsx').includes('min-w-[580px]') && src('components/DailyChart.tsx').includes('overflow-x-auto')],
  ['grafic lunar derulabil', src('components/MonthlyChart.tsx').includes('min-w-[720px]') && src('components/MonthlyChart.tsx').includes('overflow-x-auto')],
  ['fișe telemetrie pe mobil', src('components/TelemetryTable.tsx').includes('md:hidden') && src('components/TelemetryTable.tsx').includes('Exclus din KPI')],
  ['text AI fără overflow', src('components/SimpleMarkdown.tsx').includes('break-words')],
  ['accesibilitate input pe mobil', src('app/globals.css').includes('font-size: 16px !important')],
];
for (const [name, ok] of checks) { assert.ok(ok, name); console.log(' ✓ ' + name); }
console.log(`OK: ${checks.length} verificări structurale responsive. Nu sunt teste de browser.`);
