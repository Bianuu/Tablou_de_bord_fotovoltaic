const { execFileSync } = require('node:child_process');
const { existsSync, mkdtempSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const os = require('node:os');
const root = join(__dirname, '..');
function loadModules() {
  const out = mkdtempSync(join(os.tmpdir(), 'pv-dashboard-tests-'));
  const tsc = join(root, 'node_modules', '.bin', 'tsc');
  try {
    execFileSync(existsSync(tsc) ? tsc : 'tsc', [
      '--target', 'ES2022', '--module', 'commonjs', '--moduleResolution', 'node', '--skipLibCheck',
      '--outDir', out, ...['types','format','csv','energy','anomalies','recommendations','prompt','models'].map(n => join(root, 'lib', n + '.ts')),
    ], { cwd: root, stdio: 'pipe' });
  } catch (e) {
    rmSync(out, { recursive: true, force: true });
    throw new Error('Nu pot compila bibliotecile. Rulează npm ci. ' + String(e.stderr ?? e.message));
  }
  const get = (name) => require(join(out, name + '.js'));
  return { csv: get('csv'), energy: get('energy'), anomalies: get('anomalies'), prompt: get('prompt'), models: get('models'), close: () => rmSync(out, {recursive:true,force:true}) };
}
const settings = { batteryKwh:100, exportCapKw:2, tariffRon:1.3, simulateBattery:false, sigma:3.2, socJumpPct:15 };
function fixture(days=30, opts={}) {
  const rows = ['timestamp,pv_kw,load_kw,battery_soc_pct'];
  for (let i = 0; i < days*96; i++) {
    const d = new Date(Date.UTC(2026,5,1) + i*15*60000);
    const iso = d.toISOString().slice(0,16).replace('T', ' ');
    rows.push(`${iso},${opts.pv ?? 4},${opts.load ?? 1},${opts.soc ?? 50}`);
  }
  return rows.join('\n');
}
module.exports = { loadModules, settings, fixture };
