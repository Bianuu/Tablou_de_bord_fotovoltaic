const assert = require('node:assert/strict');
const { loadModules, settings, fixture } = require('./common.cjs');
const { csv, energy, anomalies, prompt, models, close } = loadModules();
let passed = 0;
const near = (a,b,epsilon=1e-8) => assert.ok(Math.abs(a-b) < epsilon, `${a} ≠ ${b}`);
const test = (name, fn) => { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name); throw e; } };
const calc = (text, s=settings) => {
  const parsed = csv.parseCsv(text, 'fixture.csv');
  const intervals = energy.computeIntervals(parsed.rows, s);
  return { parsed, intervals, days: energy.groupDays(intervals, s), totals: energy.summarize(intervals, s) };
};
try {
  console.log('Teste CSV + PV + baterie + anomalii + prompt AI:');
  test('30 zile la 15 minute => 2.880 intervale și 30 zile', () => {
    const r = calc(fixture()); assert.equal(r.intervals.length,2880); assert.equal(r.days.length,30); assert.equal(r.totals.excludedGridIntervals,0);
    for(const day of r.days) assert.equal(day.totals.intervals,96);
  });
  test('KPI independente: PV, consum, export, autoconsum, autosuficiență', () => {
    const t = calc(fixture()).totals;
    near(t.ePv,2880); near(t.eLoad,720); near(t.eExport,2160);
    near(t.selfConsumption,25); near(t.selfSufficiency,100);
  });
  test('plafon 2 kW: curtailment 720 kWh și export după plafon 1440 kWh', () => {
    const t = calc(fixture()).totals;
    near(t.eCurt,720); near(t.eExportEffective,1440); near(t.peakExport,3); near(t.curtPct,100/3);
  });
  test('plafon 0 / 2 / 3 / 10 kW: curtailment descrescător', () => {
    const values = [0,2,3,10].map(cap=>calc(fixture(1),{...settings,exportCapKw:cap}).totals.eCurt);
    assert.deepEqual(values,[72,24,0,0]);
  });
  test('delta SOC pe interval consecutiv se reflectă în bilanț', () => {
    const r = calc('timestamp,pv_kw,load_kw,battery_soc_pct\n01-06-26 00:00,0,0,50\n01-06-26 00:15,0,0,49');
    near(r.intervals[1].dBat,-1); near(r.intervals[1].eExport,1); near(r.intervals[1].eCurt,0.5);
  });
  test('după 30 minute de lacună NU apare fals export din salt SOC', () => {
    const r = calc('timestamp,pv_kw,load_kw,battery_soc_pct\n01-06-26 00:00,0,0,50\n01-06-26 00:45,4,1,40');
    assert.equal(r.intervals[1].gapBeforeMin,30); assert.equal(r.intervals[1].dSoc,null);
    assert.equal(r.intervals[1].gridReliable,false); near(r.intervals[1].eExport,0);
    near(r.totals.ePv,1); near(r.totals.ePvGrid,0);
    assert.equal(r.totals.excludedGridIntervals,1);
    const a=anomalies.detectAnomalies(r.intervals,r.days,settings);
    assert.ok(a.events.some(e=>e.type==='gap'&&e.detail.includes('excluse')));
  });
  test('valorile suspecte rămân vizibile, sunt anomalii și nu intră în KPI', () => {
    const r=calc('timestamp,pv_kw,load_kw,battery_soc_pct\n01-06-26 00:00,4,1,50\n01-06-26 00:15,-10,1,50\n01-06-26 00:30,4,1,50');
    assert.equal(r.parsed.skipped,0);
    assert.equal(r.parsed.suspiciousRows,1);
    assert.equal(r.parsed.rows.length,3);
    assert.equal(r.parsed.rows[1].pv,-10);
    assert.deepEqual(r.parsed.rows[1].qualityIssues, ['PV negativ (-10 kW)']);
    assert.equal(r.intervals[1].pv,-10); assert.equal(r.intervals[1].energyValid,false);
    assert.equal(r.intervals[1].gridReliable,false); assert.equal(r.intervals[2].gridReliable,true);
    assert.equal(r.intervals[2].gapBeforeMin,0);
    near(r.totals.ePv,2); near(r.totals.eLoad,0.5); near(r.totals.eExport,1.5);
    assert.equal(r.totals.invalidIntervals,1); assert.equal(r.totals.excludedGridIntervals,1);
    const a=anomalies.detectAnomalies(r.intervals,r.days,settings);
    assert.ok(a.events.some(e=>e.type==='invalid_value' && e.detail.includes('exclus')));
    assert.ok(a.flags[1].includes('invalid_value'));
  });
  test('SOC în afara 0–100% și consum negativ sunt păstrate, dar excluse energetic', () => {
    const s='timestamp,pv_kw,load_kw,battery_soc_pct\n01-06-26 00:00,1,1,50\n01-06-26 00:15,1,-2,50\n01-06-26 00:30,1,1,140\n01-06-26 00:45,1,1,-1';
    const r=calc(s); assert.equal(r.parsed.rows.length,4); assert.equal(r.parsed.skipped,0);
    assert.equal(r.parsed.suspiciousRows,3); assert.equal(r.intervals[2].soc,140);
    near(r.totals.ePv,0.25); near(r.totals.eLoad,0.25);
    assert.equal(r.totals.invalidIntervals,3); assert.equal(r.totals.gridIntervals,1);
    assert.equal(r.totals.socMax,50);
  });
  test('SOC suspect taie doar bilanțul intervalului următor; un PV suspect cu SOC valid nu îl taie', () => {
    const soc=calc('timestamp,pv_kw,load_kw,battery_soc_pct\n01-06-26 00:00,4,1,50\n01-06-26 00:15,4,1,150\n01-06-26 00:30,4,1,40\n01-06-26 00:45,4,1,40');
    assert.equal(soc.intervals[1].energyValid,false);
    assert.equal(soc.intervals[2].gridReliable,false);
    assert.equal(soc.intervals[3].gridReliable,true);
    near(soc.totals.eExport,1.5);
  });
  test('date numerice lipsă/nenumerice sunt păstrate în jurnalul brut', () => {
    const s='timestamp,pv_kw,load_kw,battery_soc_pct\n01-06-26 00:00,2,1,50\n01-06-26 00:15,abc,1,50\n01-06-26 00:30,2,1,50';
    const r=calc(s); assert.equal(r.parsed.rows.length,2); assert.equal(r.parsed.skipped,1);
    assert.ok(r.parsed.rejectedRows[0].rawLine.includes('abc'));
    assert.equal(r.parsed.rejectedRows[0].line,3);
    assert.equal(r.intervals[1].gridReliable,false);
  });
  test('timp în afara pasului de 15 minute este exclus', () => {
    const p=csv.parseCsv('timestamp,pv_kw,load_kw,battery_soc_pct\n01-06-26 00:00,1,1,50\n01-06-26 00:13,1,1,50\n01-06-26 00:15:30,1,1,50','dates.csv');
    assert.equal(p.skipped,2); assert.equal(p.rejectedRows.length,2);
  });
  test('duplicatele nu dublează producția', () => {
    const p=csv.parseCsv('timestamp,pv_kw,load_kw,battery_soc_pct\n01-06-26 00:00,4,1,50\n01-06-26 00:00,8,1,50','dupe.csv');
    assert.equal(p.duplicates,1); assert.equal(p.rows.length,1); assert.equal(p.rows[0].pv,4); assert.equal(p.rejectedRows.length,1);
  });
  test('în cazul unui duplicat se preferă măsurătoarea validă, iar originalul suspect rămâne în jurnal', () => {
    const p=csv.parseCsv('timestamp,pv_kw,load_kw,battery_soc_pct\n01-06-26 00:00,-10,1,140\n01-06-26 00:00,4,1,50','dupe.csv');
    assert.equal(p.duplicates,1); assert.equal(p.rows[0].pv,4);
    assert.equal(p.rejectedRows[0].line,2); assert.ok(p.rejectedRows[0].rawLine.includes('-10'));
  });
  test('datele DD-MM-YY, ISO, CSV cu ; și virgulă zecimală', () => {
    const p=csv.parseCsv('timestamp;pv_kw;load_kw;battery_soc_pct\n01-06-26 00:00;"2,5";1;50\n2026-06-01 00:15;3;1;50','test.csv');
    assert.equal(p.rows.length,2); near(p.rows[0].pv,2.5);
  });
  test('procentele brute imposibile nu sunt mascate prin clamp', () => {
    const t=calc('timestamp,pv_kw,load_kw,battery_soc_pct\n01-06-26 00:00,1,0,50\n01-06-26 00:15,1,0,40').totals;
    assert.ok(t.selfConsumptionRaw<0); assert.equal(t.selfConsumption,null);
  });
  test('numitori 0 => procente null, nu NaN/Infinity', () => {
    const t=calc('timestamp,pv_kw,load_kw,battery_soc_pct\n01-06-26 00:00,0,0,50').totals;
    assert.equal(t.selfConsumption,null); assert.equal(t.selfSufficiency,null);
  });
  test('bilanț energetic în intervalele fiabile este închis', () => {
    const t=calc(fixture(1)).totals;
    near(t.ePvGrid-t.eLoadGrid-t.eBatNet-(t.eExport-t.eImport),0);
  });
  test('cap for curtailment <1% e aproape de puterea exportată', () => {
    const r=calc(fixture(1)); const cap=energy.capForCurtailmentBelow(r.intervals,1);
    assert.ok(cap >2.96 && cap<=3);
  });
  test('prompt AI include acoperire și N/A; nu expune chei', () => {
    const r=calc(fixture(1));
    const payload={mode:'proprietar',dayLabel:r.days[0].label,daysInPeriod:1,settings:{batteryKwh:100,exportCapKw:2,tariffRon:1.3},dayTotals:r.totals,periodTotals:r.totals,anomalies:[],series:'00:00;4;1;50;N/A;N/A'};
    assert.ok(prompt.buildSystemPrompt(payload).includes('N/A'));
    assert.ok(prompt.buildUserPrompt(payload).includes('Acoperire bilanț'));
    assert.ok(prompt.buildUserPrompt(payload).includes('N/A'));
  });
  test('model Claude detectat și separat de ceilalți furnizori', () => {
    assert.equal(models.isClaudeModel('anthropic/claude-sonnet-5-5'),true);
    assert.equal(models.isClaudeModel('gpt-5'),false);
  });
  console.log(`\nOK: ${passed} teste trecute. Acestea NU testează un apel LLM live sau interfața Next.js.`);
} finally { close(); }
