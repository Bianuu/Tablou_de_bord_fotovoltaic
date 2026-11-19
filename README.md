# Dashboard PV Solar (Next.js 14 + Vercel)

Aplicație web care încarcă un CSV cu 30 de zile de date la 15 minute (producție PV, consum, SOC baterie) și afișează curbe zilnice, KPI-uri, efectul unui plafon de export (curtailment) și o analiză AI în limba română.

Stack: Next.js 14 (App Router), TypeScript, Tailwind CSS, Recharts. Calculele rulează în browser; doar analiza AI trece prin ruta server `/api/analyze`.

## Formatul CSV

Patru coloane, exact cu aceste nume: `timestamp,pv_kw,load_kw,battery_soc_pct`. Data este `DD-MM-YY H:MM` (ex. `01-06-26 5:15`); se acceptă și `DD-MM-YYYY HH:MM` și ISO (`2026-06-01T05:15`). Separatorul poate fi virgulă, punct și virgulă sau tab; zecimalele cu punct sau virgulă. Aplicația nu preîncarcă niciun CSV demonstrativ: la deschidere cere fișierul (click sau drag & drop), iar butonul „Încarcă alt CSV” din header schimbă fișierul oricând.

## Formule (Δt = 0,25 h)

```
E_pv(t)     = pv_kw(t) · 0,25
E_load(t)   = load_kw(t) · 0,25
ΔE_bat(t)   = (SOC(t) − SOC(t−1)) / 100 · Capacitate_kWh      (+ încărcare, − descărcare)
E_grid(t)   = E_pv(t) − E_load(t) − ΔE_bat(t)                (> 0 export, < 0 import)

Autoconsum (%)      = (ΣE_pv_fiabil − ΣE_export) / ΣE_pv_fiabil · 100
Autosuficiență (%)  = (ΣE_load_fiabil − ΣE_import) / ΣE_load_fiabil · 100
Energie exportată   = Σ max(0, E_grid(t)) (doar intervalele cu bilanț fiabil)

P_export(t) = max(0, E_grid(t) / 0,25)
P_curt(t)   = max(0, P_export(t) − P_plafon)
E_curt(t)   = P_curt(t) · 0,25
```

- Capacitatea bateriei se setează în interfață (implicit 100 kWh), pentru că CSV-ul conține SOC în %, nu putere. Valorile calculate nu sunt măsurători de contor.
- Sufixul `_fiabil` indică suma din intervalele fără valori suspecte și cu SOC anterior valid la exact 15 minute (primul interval folosește convenția ΔSOC=0). După o lacună ori după un SOC suspect, exportul/curtailment-ul sunt indisponibile pe primul interval următor și nu se extrapolează.
- **Politica datelor brute:** un PV/consum negativ sau un SOC în afara 0–100% **rămâne afișat nemodificat** în grafice, tabelul telemetric și lista de anomalii; **nu este inclus în niciun KPI**. Dacă rândul precedent este suspect, următorul poate contribui la producție/consum, dar nu la export/curtailment (nu se poate stabili corect ΔSOC). Valorile neinterpretabile numeric, timpii invalidi și duplicatele apar într-un **jurnal de import cu linia CSV originală**, fără să fie folosite în agregări.
- Curtailment-ul se calculează pe profilul bateriei exact cum este în fișier, fără resimularea bateriei.
- Bifa „Simulează redistribuire surplus tăiat în baterie” estimează separat cât din energia tăiată ar fi încăput în baterie până la 100% SOC, la fiecare interval (spațiu liber = (100 − SOC)% din capacitate, minus ce s-a recuperat deja în aceeași zi).
- Economia estimată = (ΣE_load − ΣE_import) × tarif (RON/kWh, configurabil).

## Cum funcționează, cap-coadă

1. **Parsare CSV** (`lib/csv.ts`): detectează separatorul, verifică antetul, recunoaște formatul datei, sortează rândurile și raportează rândurile invalide și duplicatele.
2. **Bilanț** (`lib/energy.ts`): aplică formulele de mai sus pe fiecare interval și agregă pe zi și pe toată perioada.
3. **Anomalii deterministe** (`lib/anomalies.ts`): PV 0 kW între 10:00 și 15:00, consum peste media + 3,2σ (pragul se poate schimba în modul Operator), salturi de SOC peste prag, intervale lipsă și zile incomplete. Valorile suspecte fizic sunt păstrate în datele brute, marcate cu `invalid_value` și excluse numai din calcule; cele structural neinterpretabile sunt păstrate în jurnalul CSV.
4. **Interfață** (`components/`): comutator Mod Proprietar / Mod Operator Tehnic în header, selector de zi (listă, butoane anterior/următor, click pe graficul cu bare), grafic zilnic cu axă kW și axă SOC %, linia plafonului și zona tăiată hașurată, grafic pe 30 de zile export efectiv vs. energie tăiată. Modul Operator adaugă bilanțul detaliat, puterile de vârf, formulele și tabelul telemetric filtrabil (Toate / Doar Curtailment / Doar Anomalii) cu export CSV.
5. **Agent AI BYOK** (`app/api/analyze/route.ts`, `lib/llm.ts`, `lib/prompt.ts`): browserul trimite KPI-urile zilei selectate, anomaliile locale și seria de 96 de intervale; serverul construiește promptul în română (adaptat modului) și apelează furnizorul. Butonul „Analizează cu Claude” apelează exclusiv API-ul Anthropic; butonul „Selectează alt LLM” oferă doar OpenAI, Google Gemini și OpenRouter (modelele Claude sunt refuzate acolo). Cheia vine din câmpul din pagină sau, dacă acesta e gol, din variabilele de mediu. Cheile nu se salvează nicăieri.

Modelele Claude din listă sunt `claude-sonnet-5-5` (implicit), `claude-opus-5-5` și `claude-haiku-5-5`. `claude-3-5-sonnet` și `claude-3-5-haiku` au fost retrase de Anthropic, iar `claude-sonnet-4-5` se retrage pe 30 noiembrie 2026; orice alt ID se poate scrie în câmpul „Alt model Claude”.

## Rulare locală

```bash
npm install
cp .env.example .env.local   # opțional, doar dacă vreți chei pe server
npm run dev                  # http://localhost:3000
```

Necesită Node.js 20 sau mai nou.

## Încărcare pe Git și deploy pe Vercel

```bash
git init
git add .
git commit -m "Dashboard PV Solar"
git branch -M main
git remote add origin https://github.com/<utilizator>/<repo>.git
git push -u origin main
```

Apoi în Vercel: **Add New → Project → Import** repository-ul. Framework-ul (Next.js) este detectat automat, fără nicio configurare. Opțional, în **Settings → Environment Variables** adăugați `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY` și apăsați **Redeploy**.

**Atenție la cheile din Vercel:** linkul aplicației este public, iar o cheie pusă în variabilele de mediu poate fi folosită de orice vizitator (nu o vede, dar consumă din creditul vostru). Varianta sigură este să lăsați variabilele goale și să introduceți cheia doar în pagină. Dacă vreți totuși chei pe server, setați și `SERVER_KEYS_ACCESS_CODE`: cheile de pe server se folosesc atunci doar de cine introduce codul. Alternativ, activați Deployment Protection din Vercel.

## Revizie de corectitudine — validarea înainte de predare

**Modificări:** rândurile cu PV/consum negativ sau SOC în afara 0–100% se păstrează nemodificate în grafic și tabel, sunt marcate `invalid_value` și se exclud numai din KPI; timestamp-urile în afara grilei, duplicatele și câmpurile neinterpretabile rămân disponibile într-un jurnal CSV cu textul original. Lipsa unei măsurători SOC între două rânduri înseamnă că bilanțul rețelei **nu poate fi calculat** pentru primul rând de după lacună; nu mai atribuim integral saltul bateriei acelui interval. În tabel și pe grafic exportul necunoscut este `—`/lacună, nu zero; exportul, importul și curtailment-ul îl exclud. KPI-urile procentuale folosesc numitori corespunzători intervalelor cu bilanț disponibil. Procentele imposibile fizic sunt afișate `—`, cu avertizare, nu corectate prin limitare la 0–100%.

**Limitări:** valorile de export și KPI-urile sunt estimate din SOC pentru capacitatea selectată, fără eficiență/pierderi de baterie, nefiind măsurători directe din contor. Primul interval presupune `ΔSOC=0`. Când există intervale lipsă, totalurile PV/consum acoperă toate măsurătorile valide, dar exportul/curtailment-ul doar intervalele cu bilanț calculabil (nu se extrapolează). Simularea suplimentară a recuperării surplusului în baterie rămâne orientativă.

**Testare:** necesită Node.js **20+**. Rulare după `npm ci`:

```bash
npm test                             # 20 teste automate (fără chei, pe date sintetice)
npm run test:csv -- ./date-test.csv  # audit al CSV-ului original descărcat separat
npm run lint                        # Next ESLint
npm run build                       # build Next.js
npm run dev                         # demonstrație în browser
```

În `tests/fixtures/synthetic_30d.csv` există **un fișier sintetic valid**, iar în `tests/fixtures/anomaly_demo.csv` este un exemplu de o zi cu 3 valori suspecte și un câmp neinterpretabil, pentru demonstrarea vizuală a semnalării anomaliilor și a jurnalului brut; nu este fișierul cerut de evaluator. CSV-ul original se descarcă de la `https://stev-wa.stoneage.ro/hr/date-test.csv` și se testează separat. Un workflow GitHub Actions (`.github/workflows/ci.yml`) rulează testele, lint-ul și build-ul la push.

**Test AI live, opțional:** pornește aplicația și setează temporar cheia `ANTHROPIC_API_KEY` doar în sesiunea terminalului, apoi `npm run test:ai`. Testul trimite o zi sintetică la API-ul real și verifică rubricile rezumatului; poate consuma credit. În PowerShell, variabila se setează cu `$env:ANTHROPIC_API_KEY="cheia_ta"`. Nu publica cheia și nu te baza pe un test fără cheie drept dovadă a unui apel reușit.

Vezi [`docs/VALIDARE_SI_DEMONSTRARE.md`](docs/VALIDARE_SI_DEMONSTRARE.md) pentru rezultatele testelor, pașii de demonstrare și limitele verificării efectuate.


## Interfață adaptivă (desktop, tabletă, mobil)

- **Desktop (>1024 px)**: navigație completă, KPI-uri în grilă, grafice pe toată lățimea, tabel telemetric complet.
- **Telefon (320–430 px)**: modurile Proprietar/Operator ocupă lățimea disponibilă, plafonul de export e accesibil imediat, iar setările suplimentare se extind la cerere. KPI-urile sunt afișate în 1–2 coloane, în funcție de lățime; formularele și butoanele au suprafețe mari pentru atingere.
- **Grafice mobile**: 96 de puncte/zi și 30 de bare rămân lizibile prin glisare *în interiorul graficului*, fără a lărgi pagina; pe tabletă și desktop se adaptează la lățime.
- **Telemetrie**: pe telefon fiecare interval devine o fișă compactă care păstrează valorile brute, explicațiile de excludere și anomaliile. Pe ecrane mari apare tabelul tehnic complet; exportul CSV rămâne disponibil peste tot.
- Testare recomandată în DevTools la **320×640, 375×812, 390×844, 768×1024 și 1440×900**. Verificați că nu apare scroll orizontal la nivelul paginii; doar graficele și tabelele declarate derulabile îl folosesc.

Vezi și [docs/RESPONSIVE_QA.md](docs/RESPONSIVE_QA.md) pentru matricea de verificare pe telefon, tabletă și calculator.
