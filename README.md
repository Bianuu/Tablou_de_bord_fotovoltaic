# Dashboard PV Solar (Next.js 14 + Vercel)

Aplicație web care încarcă un CSV cu 30 de zile de date la 15 minute (producție PV, consum, SOC baterie) și afișează curbe zilnice, KPI-uri, efectul unui plafon de export (curtailment) și o analiză AI în limba română.

Stack: Next.js 14 (App Router), TypeScript, Tailwind CSS, Recharts. Calculele rulează în browser; doar analiza AI trece prin ruta server `/api/analyze`.

## Formatul CSV

Patru coloane, exact cu aceste nume: `timestamp,pv_kw,load_kw,battery_soc_pct`. Data este `DD-MM-YY H:MM` (ex. `01-06-26 5:15`); se acceptă și `DD-MM-YYYY HH:MM` și ISO (`2026-06-01T05:15`). Separatorul poate fi virgulă, punct și virgulă sau tab; zecimalele cu punct sau virgulă. Aplicația nu conține niciun CSV demonstrativ: la deschidere cere fișierul (click sau drag & drop), iar butonul „Încarcă alt CSV” din header schimbă fișierul oricând.

## Formule (Δt = 0,25 h)

```
E_pv(t)     = pv_kw(t) · 0,25
E_load(t)   = load_kw(t) · 0,25
ΔE_bat(t)   = (SOC(t) − SOC(t−1)) / 100 · Capacitate_kWh      (+ încărcare, − descărcare)
E_grid(t)   = E_pv(t) − E_load(t) − ΔE_bat(t)                (> 0 export, < 0 import)

Autoconsum (%)      = (ΣE_pv − ΣE_export) / ΣE_pv · 100
Autosuficiență (%)  = (ΣE_load − ΣE_import) / ΣE_load · 100
Energie exportată   = Σ max(0, E_grid(t))

P_export(t) = max(0, E_grid(t) / 0,25)
P_curt(t)   = max(0, P_export(t) − P_plafon)
E_curt(t)   = P_curt(t) · 0,25
```

- Capacitatea bateriei se setează în interfață (implicit 100 kWh), pentru că CSV-ul conține SOC în %, nu putere.
- Curtailment-ul se calculează pe profilul bateriei exact cum este în fișier, fără resimularea bateriei.
- Bifa „Simulează redistribuire surplus tăiat în baterie” estimează separat cât din energia tăiată ar fi încăput în baterie până la 100% SOC, la fiecare interval (spațiu liber = (100 − SOC)% din capacitate, minus ce s-a recuperat deja în aceeași zi).
- Economia estimată = (ΣE_load − ΣE_import) × tarif (RON/kWh, configurabil).

## Cum funcționează, cap-coadă

1. **Parsare CSV** (`lib/csv.ts`): detectează separatorul, verifică antetul, recunoaște formatul datei, sortează rândurile și raportează rândurile invalide și duplicatele.
2. **Bilanț** (`lib/energy.ts`): aplică formulele de mai sus pe fiecare interval și agregă pe zi și pe toată perioada.
3. **Anomalii deterministe** (`lib/anomalies.ts`): PV 0 kW între 10:00 și 15:00, consum peste media + 3,2σ (pragul se poate schimba în modul Operator), salturi de SOC peste prag, intervale lipsă, zile incomplete, valori imposibile.
4. **Interfață** (`components/`): comutator Mod Proprietar / Mod Operator Tehnic în header, selector de zi (listă, butoane anterior/următor, click pe graficul cu bare), grafic zilnic cu axă kW și axă SOC %, linia plafonului și zona tăiată hașurată, grafic pe 30 de zile export efectiv vs. energie tăiată. Modul Operator adaugă bilanțul detaliat, puterile de vârf, formulele și tabelul telemetric filtrabil (Toate / Doar Curtailment / Doar Anomalii) cu export CSV.
5. **Agent AI BYOK** (`app/api/analyze/route.ts`, `lib/llm.ts`, `lib/prompt.ts`): browserul trimite KPI-urile zilei selectate, anomaliile locale și seria de 96 de intervale; serverul construiește promptul în română (adaptat modului) și apelează furnizorul. Butonul „Analizează cu Claude” apelează exclusiv API-ul Anthropic; butonul „Selectează alt LLM” oferă doar OpenAI, Google Gemini și OpenRouter (modelele Claude sunt refuzate acolo). Cheia vine din câmpul din pagină sau, dacă acesta e gol, din variabilele de mediu. Cheile nu se salvează nicăieri.

Modelele Claude din listă sunt `claude-sonnet-5-5` (implicit), `claude-opus-5-5` și `claude-haiku-5-5`. `claude-3-5-sonnet` și `claude-3-5-haiku` au fost retrase de Anthropic, iar `claude-sonnet-4-5` se retrage pe 30 noiembrie 2026; orice alt ID se poate scrie în câmpul „Alt model Claude”.

## Rulare locală

```bash
npm install
cp .env.example .env.local   # opțional, doar dacă vreți chei pe server
npm run dev                  # http://localhost:3000
```

Necesită Node.js 18.17 sau mai nou.

## Dploy pe Vercel

 În Vercel: **Add New → Project → Import** repository-ul. Framework-ul (Next.js) este detectat automat, fără nicio configurare. Opțional, în **Settings → Environment Variables** adăugați `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY` și apăsați **Redeploy**.

**Atenție la cheile din Vercel:** linkul aplicației este public, iar o cheie pusă în variabilele de mediu poate fi folosită de orice vizitator (nu o vede, dar consumă din creditul vostru). Varianta sigură este să lăsați variabilele goale și să introduceți cheia doar în pagină. Dacă vreți totuși chei pe server, setați și `SERVER_KEYS_ACCESS_CODE`: cheile de pe server se folosesc atunci doar de cine introduce codul. Alternativ, activați Deployment Protection din Vercel.
