/** Test LIVE opțional: cere cheie reală și aplicația deja pornită, fără salvarea cheii. */
const {loadModules,fixture,settings}=require('./common.cjs');
const apiKey = process.env.ANTHROPIC_API_KEY;
const origin=process.env.PV_DASHBOARD_URL || 'http://localhost:3000';
if(!apiKey){console.error('Setează ANTHROPIC_API_KEY temporar în terminal și pornește npm run dev într-o altă fereastră.');process.exit(2);}
(async()=>{
 const {csv,energy,anomalies,models,close}=loadModules();
 try {
  const data=csv.parseCsv(fixture(1),'fixture-sintetic.csv');
  const intervals=energy.computeIntervals(data.rows,settings);
  const days=energy.groupDays(intervals,settings);
  const totals=energy.summarize(intervals,settings);
  const events=anomalies.detectAnomalies(intervals,days,settings).events;
  const payload={mode:'operator',dayLabel:days[0].label,daysInPeriod:1,
    settings:{batteryKwh:settings.batteryKwh,exportCapKw:settings.exportCapKw,tariffRon:settings.tariffRon},
    dayTotals:totals,periodTotals:totals,
    anomalies:events.map(e=>({severity:e.severity,title:e.title,detail:e.detail})),
    series:intervals.map(it=>`${it.time};${it.pv};${it.load};${it.soc};${it.eGrid};${it.pCurt}`).join('\n')};
  const r=await fetch(origin+'/api/analyze',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({target:'claude',provider:'anthropic',model:process.env.ANTHROPIC_MODEL||models.DEFAULT_CLAUDE_MODEL,apiKey,payload})});
  const content=await r.json();
  if(!r.ok)throw new Error(`HTTP ${r.status}: ${content.error ?? JSON.stringify(content)}`);
  if(!content.text?.includes('Rezumat') || !content.text?.includes('Anomalii'))throw new Error('Modelul a răspuns, dar rezumatul nu are rubricile necesare.');
  console.log('AI LIVE OK:',content.provider,content.model,'| caractere:',content.text.length);
  console.log('Fragment:',content.text.slice(0,200).replace(/\n/g,' '));
 }finally{close();}
})().catch(e=>{console.error('AI LIVE EȘUAT:',e.message);process.exitCode=1;});
