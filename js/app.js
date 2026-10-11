/* AURA Monitor — personal skin & hair tracking.
   Single-page app, no build step. All data is stored in this browser (localStorage key "auram.db"). */

const App = (() => {
  /* ================= helpers ================= */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));
  const avg = (arr) => { const v = arr.filter((x) => x != null && !Number.isNaN(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const round = (v, d = 0) => v == null ? null : Math.round(v * 10 ** d) / 10 ** d;
  const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => iso(new Date());
  const parse = (s) => new Date(s + 'T00:00:00');
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const lastDays = (n, end = today()) => Array.from({ length: n }, (_, i) => addDays(end, i - n + 1));
  const fmtDay = (s) => parse(s).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  const fmtShort = (s) => parse(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  const store = {
    get(k, d) { try { const v = localStorage.getItem('auram.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('auram.' + k, JSON.stringify(v)); return true; } catch { toast('Storage is full. Delete some old photo scans in Scan → History.'); return false; } },
  };

  let toastTimer;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }
  function dialog(html, buttons = [{ label: 'Close' }]) {
    const m = $('#modal');
    m.querySelector('.modal-body').innerHTML = html;
    const foot = m.querySelector('.modal-foot'); foot.innerHTML = '';
    buttons.forEach((b) => {
      const el = document.createElement('button'); el.className = 'btn sm ' + (b.cls || ''); el.textContent = b.label;
      el.onclick = () => { if (b.fn?.() === false) return; m.classList.add('hidden'); };
      foot.appendChild(el);
    });
    m.classList.remove('hidden'); foot.lastChild?.focus();
  }
  const askConfirm = (msg, yes, label = 'Delete') => dialog(`<p style="margin:0">${esc(msg)}</p>`, [{ label: 'Cancel', cls: 'ghost' }, { label, cls: 'danger', fn: yes }]);
  function copyText(txt) {
    const fallback = () => dialog(`<p class="small muted">Select the text below and copy it.</p><textarea rows="8" readonly>${esc(txt)}</textarea>`);
    try { navigator.clipboard.writeText(txt).then(() => toast('Copied'), fallback); } catch { fallback(); }
  }

  /* ================= data model ================= */
  const DEFAULT_ROUTINE = {
    am: [{ id: 'a1', name: 'Gentle cleanser', kind: 'skin' }, { id: 'a2', name: 'Niacinamide serum', kind: 'skin' }, { id: 'a3', name: 'Moisturizer', kind: 'skin' }, { id: 'a4', name: 'Sunscreen SPF 50 PA++++', kind: 'skin' }],
    pm: [{ id: 'p1', name: 'Cleanser', kind: 'skin' }, { id: 'p2', name: 'Treatment (BHA / retinol night)', kind: 'skin' }, { id: 'p3', name: 'Moisturizer', kind: 'skin' }, { id: 'p4', name: 'Scalp massage, 4 min', kind: 'hair' }, { id: 'p5', name: 'Scalp serum', kind: 'hair' }],
  };
  const DEFAULT_REM = [
    { id: 'r1', label: 'Morning routine + sunscreen', time: '07:30', days: [0, 1, 2, 3, 4, 5, 6], on: true },
    { id: 'r2', label: 'Night routine + daily check-in', time: '22:00', days: [0, 1, 2, 3, 4, 5, 6], on: true },
    { id: 'r3', label: 'Weekly photo scan', time: '10:00', days: [0], on: true },
  ];
  const DEMO_V = 2;
  const fresh = () => ({
    v: 2, logs: {}, scans: [], routine: structuredClone(DEFAULT_ROUTINE), reminders: structuredClone(DEFAULT_REM), demo: false,
    profile: { name: '', skinType: 'Combination', hairType: 'Wavy', sex: 'female', age: 25, weight: 60, height: 162, activity: 'light', goal: 'maintain' },
    sleep: { alarm: '07:00', alarmOn: true, days: [0, 1, 2, 3, 4, 5, 6], need: 8, sessions: [], active: null },
    plate: { items: { paneer: 1, sabzi: 1, salad: 1, millet: 1, chaas: 1 } },
  });
  const newLog = () => ({
    skin: { oil: 3, dry: 2, red: 1, sens: 1, breakouts: 0, zones: [] },
    hair: { fall: 70, itch: 1, flakes: 1, oil: 3, frizz: 3, wash: false },
    life: { sleep: 7, water: 6, stress: 4, sun: 30, junk: false, period: false, workout: false, hot: false, protein: null, meals: { b: true, l: true, d: true } },
    done: { am: [], pm: [] }, flags: [], note: '',
  });

  let db;
  const save = () => store.set('db', db);

  /* ================= scoring ================= */
  const skinScore = (l) => { const s = l?.skin; if (!s) return null; return Math.round(clamp(100 - Math.min(35, s.breakouts * 3.5) - s.red * 2 - s.sens * 1.5 - s.oil * 1.3 - s.dry * 1.5)); };
  const hairScore = (l) => { const h = l?.hair; if (!h) return null; return Math.round(clamp(100 - Math.min(40, Math.max(0, h.fall - 40) / 160 * 40) - h.itch * 1.5 - h.flakes * 2 - h.oil - h.frizz)); };
  const doneShare = (l, when) => { const steps = db.routine[when]; if (!l || !steps.length) return null; return steps.filter((s) => l.done[when].includes(s.id)).length / steps.length; };
  const adherence = (l) => { if (!l) return null; const tot = db.routine.am.length + db.routine.pm.length; if (!tot) return null; return (db.routine.am.filter((s) => l.done.am.includes(s.id)).length + db.routine.pm.filter((s) => l.done.pm.includes(s.id)).length) / tot; };

  const METRICS = {
    skinScore: { label: 'Skin score', color: '#3cf0ff', get: skinScore, max: 100 },
    hairScore: { label: 'Hair score', color: '#a77bff', get: hairScore, max: 100 },
    fall: { label: 'Hair fall / day', color: '#ff4fd8', get: (l) => l.hair?.fall, max: 'auto', lowerBetter: true },
    breakouts: { label: 'Breakouts', color: '#ff5c7a', get: (l) => l.skin?.breakouts, max: 'auto', lowerBetter: true },
    red: { label: 'Redness', color: '#ff8f6b', get: (l) => l.skin?.red, max: 10, lowerBetter: true },
    oil: { label: 'Skin oiliness', color: '#ffc24b', get: (l) => l.skin?.oil, max: 10, lowerBetter: true },
    dry: { label: 'Dryness', color: '#7fd3ff', get: (l) => l.skin?.dry, max: 10, lowerBetter: true },
    flakes: { label: 'Scalp flakes', color: '#d5c2ff', get: (l) => l.hair?.flakes, max: 10, lowerBetter: true },
    sleep: { label: 'Sleep (h)', color: '#9dff6a', get: (l) => l.life?.sleep, max: 11 },
    stress: { label: 'Stress', color: '#ff9de2', get: (l) => l.life?.stress, max: 10, lowerBetter: true },
    water: { label: 'Water (glasses)', color: '#6bb8ff', get: (l) => l.life?.water, max: 'auto' },
    protein: { label: 'Protein (g)', color: '#ffd27a', get: (l) => l.life?.protein ?? null, max: 'auto' },
    routine: { label: 'Routine done %', color: '#e9edff', get: (l) => { const a = adherence(l); return a == null ? null : Math.round(a * 100); }, max: 100 },
  };
  const series = (key, dates) => dates.map((d) => (db.logs[d] ? METRICS[key].get(db.logs[d]) ?? null : null));
  const avgOver = (key, n, end = today()) => avg(series(key, lastDays(n, end)));

  function streak() {
    let d = db.logs[today()] ? today() : addDays(today(), -1), n = 0;
    while (db.logs[d]) { n++; d = addDays(d, -1); }
    return n;
  }
  const meals = (l) => l?.life?.meals || { b: true, l: true, d: true };

  /* Daily targets from published reference values:
     energy = Mifflin-St Jeor BMR x activity; protein g/kg (ICMR-NIN 2020 RDA 0.83 g/kg, more when active or losing weight);
     fat 30% of energy and carbs the remainder (IOM ranges: fat 20-35%, carbs 45-65%); ICMR-NIN 2024 suggests cereals stay near 45%;
     fibre 14 g per 1000 kcal (IOM);
     water from drinks = ~80% of EFSA adequate total intake (women 2.0 L, men 2.5 L), +0.5 L for a workout or a hot day. */
  function targets(p = db.profile, l = db.logs[today()]) {
    const male = p.sex === 'male', w = +p.weight || 60, h = +p.height || 162, a = +p.age || 25;
    const bmr = 10 * w + 6.25 * h - 5 * a + (male ? 5 : -161);
    const act = { sedentary: 1.2, light: 1.375, moderate: 1.55, very: 1.725 }[p.activity] || 1.375;
    const tdee = bmr * act, kcal = p.goal === 'lose' ? Math.max(bmr * 1.1, tdee * 0.85) : tdee;
    const pk = p.goal === 'lose' ? 1.2 : p.activity === 'very' ? 1.4 : p.activity === 'moderate' ? 1.2 : 1.0;
    const protein = w * pk, fat = (kcal * 0.3) / 9, carbs = Math.max(0, kcal - protein * 4 - fat * 9) / 4, fiber = (kcal / 1000) * 14;
    const waterBase = male ? 2.0 : 1.6, extra = (l?.life?.workout ? 0.5 : 0) + (l?.life?.hot ? 0.5 : 0), water = waterBase + extra;
    return { bmr, tdee, kcal, pk, protein, carbs, fat, fiber, waterBase, extra, water, glasses: Math.ceil(water / 0.25) };
  }
  const lastLogDate = () => Object.keys(db.logs).sort().at(-1) || null;

  /* ================= insights engine ================= */
  const FLAGS = [
    ['mole', 'A mole or spot changed shape or colour, itches or bled'],
    ['clumps', 'Hair came out in clumps, or a bald patch appeared'],
    ['cyst', 'Painful, deep lumps (cysts) under the skin'],
    ['rash', 'A rash with swelling, blisters or fever'],
  ];
  const FACTORS = [
    { id: 'sleep', label: 'Short sleep (under 6.5 h)', test: (l) => l.life.sleep < 6.5 },
    { id: 'stress', label: 'High stress (7+)', test: (l) => l.life.stress >= 7 },
    { id: 'junk', label: 'Junk or sugary food', test: (l) => l.life.junk },
    { id: 'period', label: 'Period days', test: (l) => l.life.period },
    { id: 'sun', label: 'Over 1 hour in the sun', test: (l) => l.life.sun > 60 },
    { id: 'water', label: 'Under 6 glasses of water', test: (l) => l.life.water < 6 },
    { id: 'pm', label: 'Skipped night routine', test: (l) => (doneShare(l, 'pm') ?? 1) < 0.5 },
    { id: 'lunch', label: 'Skipped lunch', test: (l) => !meals(l).l },
    { id: 'protein', label: 'Low protein (under 60% of target)', test: (l) => (l.life.protein == null ? null : l.life.protein < targets().protein * 0.6) },
  ];
  const TARGETS = [['breakouts', 'breakouts'], ['fall', 'hair fall'], ['red', 'redness']];

  function correlations(n = 90) {
    const logs = lastDays(n).map((d) => db.logs[d]).filter(Boolean);
    const out = [];
    for (const f of FACTORS) for (const [k, name] of TARGETS) {
      const w = [], wo = [];
      logs.forEach((l) => { const v = METRICS[k].get(l), tv = f.test(l); if (v == null || tv == null) return; (tv ? w : wo).push(v); });
      if (w.length < 3 || wo.length < 3) continue;
      const a = avg(w), b = avg(wo), base = Math.max(b, k === 'fall' ? 20 : 0.5);
      out.push({ f, k, name, with: a, without: b, nWith: w.length, nWithout: wo.length, effect: (a - b) / base });
    }
    return out.sort((x, y) => Math.abs(y.effect) - Math.abs(x.effect));
  }

  function insights() {
    const out = [];
    const flags = [...new Set(lastDays(14).flatMap((d) => db.logs[d]?.flags || []))];
    flags.forEach((f) => out.push({ lv: 'bad', ic: '⚕', t: 'See a dermatologist', p: esc(FLAGS.find((x) => x[0] === f)[1]) + ' (logged in the last 14 days). This needs an in-person check.' }));
    const f7 = avgOver('fall', 7), f3 = avgOver('fall', 3), fBase = avgOver('fall', 21, addDays(today(), -7));
    if (f7 != null && f7 > 150) out.push({ lv: 'bad', ic: '⌇', t: `Shedding above 150 hairs a day all week (${Math.round(f7)})`, p: 'Persistent heavy shedding deserves a doctor visit. Ask about ferritin, vitamin D, B12 and thyroid tests.' });
    else if (f3 != null && fBase != null && f3 > fBase * 1.8 && f3 > 100) out.push({ lv: 'bad', ic: '⌇', t: 'Sudden jump in hair fall', p: `Last 3 days average ${Math.round(f3)}/day vs your usual ${Math.round(fBase)}. If it continues for 2 weeks, or comes out in clumps, see a dermatologist.` });
    const b7 = avgOver('breakouts', 7);
    if (b7 != null && b7 >= 6) out.push({ lv: 'warn', ic: '◉', t: `Breakouts averaging ${round(b7, 1)} a day`, p: 'If this lasts beyond 6–8 weeks, hurts, or leaves marks, a dermatologist can prescribe stronger treatment.' });
    for (const [k, name] of [['skinScore', 'Skin'], ['hairScore', 'Hair']]) {
      const cur = avgOver(k, 7), prev = avgOver(k, 7, addDays(today(), -7));
      if (cur == null || prev == null) continue;
      const d = cur - prev;
      if (d >= 3) out.push({ lv: 'good', ic: '↗', t: `${name} score up ${Math.round(d)} points this week`, p: `Average ${Math.round(cur)} vs ${Math.round(prev)} last week. Whatever you are doing is working.` });
      else if (d <= -3) out.push({ lv: 'warn', ic: '↘', t: `${name} score down ${Math.round(-d)} points this week`, p: `Average ${Math.round(cur)} vs ${Math.round(prev)} last week. Check Trends → Patterns for a likely trigger.` });
    }
    if (f7 != null && fBase != null && f7 < fBase * 0.85) out.push({ lv: 'good', ic: '⌇', t: `Hair fall down ${Math.round((1 - f7 / fBase) * 100)}%`, p: `${Math.round(f7)}/day this week vs ${Math.round(fBase)}/day over the 3 weeks before.` });
    correlations(60).filter((c) => c.effect >= 0.35).slice(0, 3).forEach((c) => out.push({
      lv: 'info', ic: '∿', t: `More ${c.name} on days with ${c.f.label.toLowerCase()}`,
      p: `${round(c.with, 1)} vs ${round(c.without, 1)} on other days (${c.nWith} vs ${c.nWithout} days logged). A pattern, not proof.`,
    }));
    const tg = targets(), sl7 = avgOver('sleep', 7);
    if (sl7 != null && sl7 < 7) out.push({ lv: 'warn', ic: '☾', t: `Averaging ${round(sl7, 1)} h of sleep this week`, p: `Adults need 7 hours or more (AASM/SRS). For your ${esc(db.sleep.alarm)} alarm, aim for bed by ${bedFor(db.sleep.need)}. <a href="#/sleep">Sleep →</a>` });
    const w7 = avgOver('water', 7);
    if (w7 != null && w7 < tg.glasses * 0.7) out.push({ lv: 'info', ic: '💧', t: `Water averaging ${round(w7, 1)} of ${tg.glasses} glasses`, p: 'Small, regular glasses through the day are easier than catching up at night. <a href="#/fuel">Hydration →</a>' });
    const pr7 = avg(lastDays(7).map((d) => db.logs[d]?.life.protein ?? null));
    if (pr7 != null && pr7 < tg.protein * 0.7) out.push({ lv: 'warn', ic: '◍', t: `Protein averaging ${Math.round(pr7)} g, target ${Math.round(tg.protein)} g`, p: 'Hair is built from protein. Low intake and crash dieting can trigger shedding 2–3 months later. <a href="#/fuel">Food ideas →</a>' });
    const sk7 = lastDays(7).filter((d) => db.logs[d] && !meals(db.logs[d]).l).length;
    if (sk7 >= 4) out.push({ lv: 'info', ic: '◍', t: `Lunch skipped ${sk7} of the last 7 days`, p: 'That is fine only if breakfast and dinner cover your protein and iron. A lower-carb lunch is a safer middle ground. <a href="#/fuel">Plate builder →</a>' });
    const ad = avg(lastDays(7).map((d) => adherence(db.logs[d])));
    if (ad != null && ad >= 0.85) out.push({ lv: 'good', ic: '☰', t: `Routine done ${Math.round(ad * 100)}% this week`, p: 'Consistency is what makes actives work.' });
    else if (ad != null && ad < 0.5) out.push({ lv: 'warn', ic: '☰', t: `Routine done only ${Math.round(ad * 100)}% this week`, p: 'Try a shorter routine you can keep. Three steps done daily beat seven done sometimes.' });
    if (!db.logs[today()]) out.unshift({ lv: 'info', ic: '✚', t: 'No check-in yet today', p: 'It takes about 60 seconds. <a href="#/log">Log today →</a>' });
    return out;
  }

  /* ================= image analysis (on-device, colour heuristics) ================= */
  function analyzeSkin(ctx, w, h) {
    const { data } = ctx.getImageData(0, 0, w, h);
    const N = w * h, L = new Float32Array(N), skin = new Uint8Array(N);
    let skinN = 0;
    for (let i = 0; i < N; i++) {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      L[i] = 0.299 * r + 0.587 * g + 0.114 * b;
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b, cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      if (cb > 77 && cb < 130 && cr > 133 && cr < 180 && L[i] > 50) { skin[i] = 1; skinN++; }
    }
    if (skinN < N * 0.08) return { coverage: skinN / N };
    const I = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += L[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; } }
    const R = Math.max(6, Math.round(w / 30));
    const local = (x, y) => { const x0 = Math.max(0, x - R), y0 = Math.max(0, y - R), x1 = Math.min(w, x + R + 1), y1 = Math.min(h, y + R + 1);
      return (I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0]) / ((x1 - x0) * (y1 - y0)); };
    let sL = 0, sL2 = 0, sRG = 0, sRG2 = 0;
    for (let i = 0; i < N; i++) if (skin[i]) { sL += L[i]; sL2 += L[i] ** 2; const rg = data[i * 4] - data[i * 4 + 1]; sRG += rg; sRG2 += rg * rg; }
    const mL = sL / skinN, sdL = Math.sqrt(Math.max(0, sL2 / skinN - mL * mL)), mRG = sRG / skinN, sdRG = Math.sqrt(Math.max(0, sRG2 / skinN - mRG * mRG));
    const masks = { shine: new Uint8Array(N), red: new Uint8Array(N), spots: new Uint8Array(N) };
    let shine = 0, red = 0, spots = 0, tv = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (!skin[i]) continue;
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx ? (mx - mn) / mx : 0;
      if (L[i] > mL + Math.max(1.6 * sdL, 22) && sat < 0.3) { masks.shine[i] = 1; shine++; }
      if (r - g > mRG + Math.max(1.5 * sdRG, 16) && r > 90) { masks.red[i] = 1; red++; }
      const lm = local(x, y); tv += Math.abs(L[i] - lm);
      if (L[i] < lm * 0.86) { masks.spots[i] = 1; spots++; }
    }
    const pct = (n, k) => Math.round(clamp((n / skinN) * k));
    const cols = new Uint32Array(w), rows = new Uint32Array(h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (skin[y * w + x]) { cols[x]++; rows[y]++; }
    const pctl = (arr, q) => { let acc = 0; const tgt = skinN * q; for (let k = 0; k < arr.length; k++) { acc += arr[k]; if (acc >= tgt) return k; } return arr.length - 1; };
    const bbox = { x0: pctl(cols, 0.03), x1: pctl(cols, 0.97), y0: pctl(rows, 0.03), y1: pctl(rows, 0.97) };
    return { coverage: skinN / N, masks, skin, bbox, scores: { shine: pct(shine, 1500), redness: pct(red, 2500), spots: pct(spots, 2000), evenness: Math.round(clamp(100 - (tv / skinN) * 7)) } };
  }

  function analyzeHair(ctx, w, h) {
    const { data } = ctx.getImageData(0, 0, w, h);
    const x0 = Math.round(w * 0.1), x1 = Math.round(w * 0.9), y0 = Math.round(h * 0.1), y1 = Math.round(h * 0.9);
    const hist = new Array(256).fill(0); let tot = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * w + x) * 4; hist[Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])]++; tot++; }
    // Otsu threshold separates dark hair from the lighter scalp
    let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
    let sB = 0, wB = 0, best = 0, T = 100;
    for (let t = 0; t < 256; t++) { wB += hist[t]; if (!wB) continue; const wF = tot - wB; if (!wF) break; sB += t * hist[t]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; T = t; } }
    const masks = { scalp: new Uint8Array(w * h), flakes: new Uint8Array(w * h) };
    let scalp = 0, hair = 0, flakes = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const p = y * w + x, i = p * 4, r = data[i], g = data[i + 1], b = data[i + 2];
      const L = 0.299 * r + 0.587 * g + 0.114 * b, mx = Math.max(r, g, b), sat = mx ? (mx - Math.min(r, g, b)) / mx : 0;
      if (L > 205 && sat < 0.16) { masks.flakes[p] = 1; flakes++; }
      else if (L >= T && r >= g && g >= b * 0.8) { masks.scalp[p] = 1; scalp++; }
      else if (L < T) hair++;
    }
    const area = scalp + hair + flakes;
    if (area < tot * 0.5 || !hair) return { coverage: 0 };
    const vis = (scalp / area) * 100;
    return { coverage: 1, masks, scores: { scalp: Math.round(vis), density: Math.round(100 - vis), flakes: Math.round(clamp((flakes / area) * 4000)) } };
  }

  function loadImage(file, src) {
    return new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = src || URL.createObjectURL(file); });
  }
  function toThumb(src, max = 260) {
    const k = Math.min(1, max / Math.max(src.width, src.height)), c = document.createElement('canvas');
    c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.72);
  }

  /* ================= sample data (shown until the user starts their own) ================= */
  function demoFace(br, seed) {
    const r = rng(seed), c = document.createElement('canvas'); c.width = c.height = 240; const x = c.getContext('2d', { willReadFrequently: true });
    x.fillStyle = '#141626'; x.fillRect(0, 0, 240, 240);
    const g = x.createRadialGradient(120, 110, 10, 120, 120, 120); g.addColorStop(0, '#e2a882'); g.addColorStop(1, '#9c6446');
    x.fillStyle = g; x.beginPath(); x.ellipse(120, 125, 84, 104, 0, 0, 7); x.fill();
    x.fillStyle = 'rgba(255,240,230,0.55)'; x.beginPath(); x.ellipse(120, 70, 30, 9, 0, 0, 7); x.fill();
    x.fillStyle = '#5a3426'; x.beginPath(); x.ellipse(90, 110, 11, 4, 0, 0, 7); x.ellipse(150, 110, 11, 4, 0, 0, 7); x.fill();
    x.strokeStyle = '#7a3e34'; x.lineWidth = 3; x.beginPath(); x.arc(120, 170, 20, 0.2, Math.PI - 0.2); x.stroke();
    for (let i = 0; i < br * 3; i++) { x.fillStyle = `rgba(${170 + r() * 40},${55 + r() * 20},${55 + r() * 20},0.9)`; x.beginPath(); x.arc(70 + r() * 100, 70 + r() * 140, 2.5 + r() * 2.5, 0, 7); x.fill(); }
    for (let i = 0; i < 5; i++) { x.fillStyle = 'rgba(105,62,45,0.7)'; x.beginPath(); x.arc(75 + r() * 90, 120 + r() * 50, 3 + r() * 2, 0, 7); x.fill(); }
    return c;
  }
  function demoHair(partW, flakes, seed) {
    const r = rng(seed), c = document.createElement('canvas'); c.width = c.height = 240; const x = c.getContext('2d', { willReadFrequently: true });
    x.fillStyle = '#1b130f'; x.fillRect(0, 0, 240, 240);
    const g = x.createLinearGradient(120 - partW, 0, 120 + partW, 0); g.addColorStop(0, '#1b130f'); g.addColorStop(0.3, '#d9a988'); g.addColorStop(0.7, '#d9a988'); g.addColorStop(1, '#1b130f');
    x.fillStyle = g; x.fillRect(120 - partW, 0, partW * 2, 240);
    for (let i = 0; i < 520; i++) {
      const side = r() < 0.5 ? -1 : 1, sx = 120 + side * (partW * 0.5 + r() * 120), sy = r() * 240;
      x.strokeStyle = `rgba(${40 + r() * 40},${25 + r() * 25},${18 + r() * 15},0.9)`; x.lineWidth = 1 + r() * 1.4;
      x.beginPath(); x.moveTo(sx, sy); x.quadraticCurveTo(sx + side * 18, sy + 20, sx + side * 30 + r() * 10, sy + 50); x.stroke();
    }
    for (let i = 0; i < flakes; i++) { x.fillStyle = '#f4f2ee'; x.fillRect(80 + r() * 80, r() * 240, 2, 2); }
    return c;
  }
  function seedDemo(d) {
    const r = rng(7), end = today();
    for (let i = 44; i >= 0; i--) {
      if (i > 0 && r() < 0.08) continue;
      const date = addDays(end, -i), t = 44 - i;
      const sleep = Math.round((5 + r() * 3.5) * 2) / 2, stress = Math.round(2 + r() * 7), junk = r() < 0.28, period = (t + 6) % 28 < 4;
      const water = Math.round(4 + r() * 6), sun = Math.round((10 + r() * 110) / 10) * 10, workout = r() < 0.4;
      const lunch = r() > 0.38, protein = Math.round(clamp(42 + r() * 38 - (lunch ? 0 : 16) + t * 0.25, 20, 110));
      const br = Math.max(0, Math.round(0.6 + (sleep < 6.5 ? 2 : 0) + (junk ? 1.6 : 0) + (period ? 2.4 : 0) + (stress >= 7 ? 1 : 0) + r() * 1.8 - t * 0.03));
      const zonePool = period ? ['chin', 'jawL', 'jawR'] : ['forehead', 'nose', 'cheekL', 'cheekR'];
      const zones = br ? zonePool.filter(() => r() < 0.55) : [];
      if (br && !zones.length) zones.push(zonePool[0]);
      d.logs[date] = {
        skin: { oil: Math.round(clamp(3 + (sun > 80 ? 1.5 : 0) + r() * 3, 0, 10)), dry: Math.round(r() * 3), red: Math.round(clamp(br * 0.7 + r() * 2, 0, 10)), sens: Math.round(r() * 3), breakouts: br, zones },
        hair: { fall: Math.round(clamp(112 - t * 1.1 + (stress >= 7 ? 28 : 0) + (protein < 50 ? 18 : 0) + r() * 30, 30, 260)), itch: Math.round(r() * 3 + (t < 15 ? 2 : 0)), flakes: Math.round(r() * 3 + (t < 15 ? 2.5 : 0)), oil: Math.round(3 + r() * 4), frizz: Math.round(2 + r() * 5), wash: r() < 0.4 },
        life: { sleep, water, stress, sun, junk, period, workout, hot: sun > 80, protein, meals: { b: r() < 0.9, l: lunch, d: true } },
        done: { am: d.routine.am.filter(() => r() < 0.88).map((s) => s.id), pm: d.routine.pm.filter(() => r() < (sleep < 6 ? 0.45 : 0.8)).map((s) => s.id) },
        flags: [], note: '',
      };
      const end2 = parse(date); end2.setHours(6, 40 + Math.round(r() * 50), 0, 0);
      d.sleep.sessions.push({ id: 'n' + i, start: end2.getTime() - sleep * 36e5, end: end2.getTime(), quality: Math.round(clamp(sleep - 3.5 + r() * 1.5, 1, 5)) });
    }
    [42, 35, 28, 21, 14, 7, 0].forEach((ago, k) => {
      const date = addDays(end, -ago);
      const fc = demoFace(Math.max(0, 6 - k), 100 + k), fs = analyzeSkin(fc.getContext('2d'), 240, 240);
      d.scans.push({ id: 'ds' + k, date, kind: 'skin', img: fc.toDataURL('image/jpeg', 0.75), scores: fs.scores });
      const hc = demoHair(30 - k * 2.4, 60 - k * 8, 200 + k), hs = analyzeHair(hc.getContext('2d'), 240, 240);
      d.scans.push({ id: 'dh' + k, date, kind: 'hair', img: hc.toDataURL('image/jpeg', 0.75), scores: hs.scores });
    });
    d.demo = true; d.demoV = DEMO_V;
  }
  function loadDb() {
    const saved = store.get('db', null), f = fresh();
    let d;
    if (saved && !(saved.demo && saved.demoV !== DEMO_V)) d = { ...f, ...saved, profile: { ...f.profile, ...saved.profile }, sleep: { ...f.sleep, ...saved.sleep }, plate: saved.plate || f.plate };
    else { d = f; if (saved) Object.assign(d, { routine: saved.routine || d.routine, reminders: saved.reminders || d.reminders, profile: { ...d.profile, ...saved.profile } }); seedDemo(d); }
    Object.values(d.logs).forEach((l) => { const n = newLog(); l.skin = { ...n.skin, ...l.skin }; l.hair = { ...n.hair, ...l.hair }; l.life = { ...n.life, ...l.life }; l.done ||= n.done; l.flags ||= []; });
    store.set('db', d); return d;
  }

  /* ================= visual building blocks ================= */
  const charts = {};
  function lineChart(id, dates, list, opts = {}) {
    const W = 720, H = opts.h || 260, L = 38, R = 14, T = 16, B = 28, n = dates.length;
    const x = (i) => L + (n <= 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (n - 1));
    list.forEach((s) => { const vs = s.vals.filter((v) => v != null); s.m = s.max === 'auto' ? Math.max(1, ...vs) * 1.15 : s.max; });
    const y = (v, m) => T + (1 - v / m) * (H - T - B);
    const single = list.length === 1;
    let g = '';
    [0, 0.25, 0.5, 0.75, 1].forEach((f) => {
      const yy = T + (1 - f) * (H - T - B);
      g += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="rgba(130,150,255,0.12)" ${f ? 'stroke-dasharray="3 4"' : ''}/>`;
      g += `<text x="${L - 6}" y="${yy + 3}" text-anchor="end">${single ? Math.round(f * list[0].m) : Math.round(f * 100) + '%'}</text>`;
    });
    const step = Math.max(1, Math.ceil(n / 7));
    dates.forEach((d, i) => { if (i % step === 0 || i === n - 1) g += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${fmtShort(d)}</text>`; });
    let defs = '', paths = '';
    list.forEach((s, k) => {
      const segs = []; let cur = [];
      s.vals.forEach((v, i) => { if (v == null) { if (cur.length) segs.push(cur); cur = []; } else cur.push([x(i), y(v, s.m)]); });
      if (cur.length) segs.push(cur);
      if (k === 0) {
        defs += `<linearGradient id="${id}-g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${s.color}" stop-opacity="0.32"/><stop offset="1" stop-color="${s.color}" stop-opacity="0"/></linearGradient>`;
        segs.forEach((sg) => { if (sg.length > 1) paths += `<path d="M${sg[0][0]},${H - B} ${sg.map((p) => 'L' + p.join(',')).join(' ')} L${sg.at(-1)[0]},${H - B} Z" fill="url(#${id}-g)"/>`; });
      }
      segs.forEach((sg) => {
        paths += sg.length > 1 ? `<polyline fill="none" stroke="${s.color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" points="${sg.map((p) => p.join(',')).join(' ')}"/>` : `<circle cx="${sg[0][0]}" cy="${sg[0][1]}" r="3" fill="${s.color}"/>`;
      });
      const lastI = s.vals.map((v, i) => (v != null ? i : -1)).filter((i) => i >= 0).at(-1);
      if (lastI != null) paths += `<circle cx="${x(lastI)}" cy="${y(s.vals[lastI], s.m)}" r="4.5" fill="${s.color}" stroke="#04050d" stroke-width="2"/>`;
    });
    const hov = `<line class="xh" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="rgba(255,255,255,0.35)" stroke-dasharray="3 3" visibility="hidden"/>` +
      list.map((s, k) => `<circle class="hd" data-k="${k}" r="5.5" fill="${s.color}" stroke="#fff" stroke-width="2" visibility="hidden"/>`).join('');
    charts[id] = { dates, list, x, y, W, H, L, R, n };
    return `<div class="chart-wrap" data-chart="${id}"><svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Trend chart"><defs>${defs}</defs>${g}${paths}${hov}</svg><div class="tip hidden"></div></div>
      ${single ? '' : `<div class="legend mt">${list.map((s) => `<span style="--c:${s.color}">${esc(s.label)}</span>`).join('')}</div>`}`;
  }
  function chartHover(wrap, e) {
    const c = charts[wrap.dataset.chart]; if (!c) return;
    const svg = wrap.querySelector('svg'), rect = svg.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * c.W;
    const i = clamp(Math.round(((sx - c.L) / (c.W - c.L - c.R)) * (c.n - 1)), 0, c.n - 1);
    const X = c.x(i);
    const xh = svg.querySelector('.xh'); xh.setAttribute('x1', X); xh.setAttribute('x2', X); xh.setAttribute('visibility', 'visible');
    let minY = c.H;
    c.list.forEach((s, k) => {
      const dot = svg.querySelector(`.hd[data-k="${k}"]`), v = s.vals[i];
      if (v == null) { dot.setAttribute('visibility', 'hidden'); return; }
      const Y = c.y(v, s.m); minY = Math.min(minY, Y);
      dot.setAttribute('cx', X); dot.setAttribute('cy', Y); dot.setAttribute('visibility', 'visible');
    });
    const tip = wrap.querySelector('.tip');
    tip.innerHTML = `<div class="tiny muted" style="margin-bottom:4px">${fmtDay(c.dates[i])}</div>` + c.list.map((s) => `<div class="k"><span style="color:${s.color}">${esc(s.label)}</span><b class="num">${s.vals[i] == null ? '—' : round(s.vals[i], 1)}</b></div>`).join('');
    tip.classList.remove('hidden');
    tip.style.left = clamp((X / c.W) * rect.width, 85, rect.width - 85) + 'px';
    tip.style.top = Math.max(40, (minY / c.H) * rect.height) + 'px';
  }
  function chartLeave(wrap) {
    wrap.querySelector('.tip')?.classList.add('hidden');
    $$('.xh, .hd', wrap).forEach((el) => el.setAttribute('visibility', 'hidden'));
  }

  let sparkN = 0;
  function spark(vals, color) {
    const W = 200, H = 46, pts = vals.map((v, i) => [i, v]).filter(([, v]) => v != null);
    if (pts.length < 2) return '<svg class="spark"></svg>';
    const mx = Math.max(...pts.map((p) => p[1])), mn = Math.min(...pts.map((p) => p[1])), span = mx - mn || 1;
    const X = (i) => (i / (vals.length - 1)) * W, Y = (v) => 4 + (1 - (v - mn) / span) * (H - 8);
    const coords = pts.map(([i, v]) => `${X(i)},${Y(v)}`);
    const last = pts.at(-1), gid = 'sp' + sparkN++;
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity="0.3"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
      <path d="M${X(pts[0][0])},${H} L${coords.join(' L')} L${X(last[0])},${H} Z" fill="url(#${gid})"/><polyline points="${coords.join(' ')}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"/>
      <circle cx="${X(last[0])}" cy="${Y(last[1])}" r="3.5" fill="${color}"/></svg>`;
  }

  const ZONES = [
    ['forehead', 'Forehead', 'ellipse', 'cx="100" cy="62" rx="50" ry="21"'],
    ['nose', 'Nose', 'path', 'd="M90 90 L110 90 L117 142 L83 142 Z"'],
    ['cheekL', 'Left cheek', 'ellipse', 'cx="57" cy="128" rx="22" ry="26"'],
    ['cheekR', 'Right cheek', 'ellipse', 'cx="143" cy="128" rx="22" ry="26"'],
    ['chin', 'Chin', 'ellipse', 'cx="100" cy="202" rx="25" ry="14"'],
    ['jawL', 'Left jaw', 'ellipse', 'cx="54" cy="178" rx="12" ry="22" transform="rotate(-28 54 178)"'],
    ['jawR', 'Right jaw', 'ellipse', 'cx="146" cy="178" rx="12" ry="22" transform="rotate(28 146 178)"'],
  ];
  function faceMap({ selected = [], heat = null, edit = false } = {}) {
    const mx = heat ? Math.max(1, ...Object.values(heat)) : 1;
    return `<svg class="face ${edit ? 'edit' : ''}" viewBox="0 0 200 240" role="img" aria-label="Face map">
      <path class="outline" d="M100 18 C160 18 176 70 172 122 C168 172 140 226 100 228 C60 226 32 172 28 122 C24 70 40 18 100 18 Z"/>
      <path class="outline" d="M66 102 q12 -8 24 0 M110 102 q12 -8 24 0 M86 172 q14 8 28 0" opacity="0.6"/>
      ${ZONES.map(([id, label, tag, attrs]) => {
        const on = selected.includes(id), a = heat ? 0.06 + 0.8 * ((heat[id] || 0) / mx) : null;
        return `<${tag} class="zone ${on ? 'on' : ''}" ${edit ? `data-act="zone" data-z="${id}" tabindex="0" role="button" aria-pressed="${on}" aria-label="${label}"` : ''} ${attrs} ${a != null ? `style="fill:rgba(255,79,216,${a.toFixed(2)})"` : ''}><title>${label}${heat ? ': ' + (heat[id] || 0) + ' days' : ''}</title></${tag}>`;
      }).join('')}
    </svg>`;
  }
  function zoneHeat(n = 30) {
    const h = {}; lastDays(n).forEach((d) => (db.logs[d]?.skin.zones || []).forEach((z) => (h[z] = (h[z] || 0) + 1))); return h;
  }

  function heatmap(key, weeks = 6) {
    const end = today(); let start = addDays(end, -(weeks * 7 - 1));
    while (parse(start).getDay() !== 1) start = addDays(start, -1);
    let cells = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => `<div class="wk">${d}</div>`).join('');
    for (let d = start; d <= end || parse(d).getDay() !== 1; d = addDays(d, 1)) {
      if (d > end) { cells += '<div class="d empty" aria-hidden="true"></div>'; continue; }
      const l = db.logs[d], v = l ? METRICS[key].get(l) : null;
      const hue = v == null ? null : 350 - (v / 100) * 165;
      cells += `<button class="d ${d === end ? 'today' : ''}" data-go="#/log/${d}" title="${fmtDay(d)}${v == null ? ' · not logged' : ' · score ' + v}" style="${v == null ? '' : `background:hsla(${hue},90%,58%,${(0.25 + (v / 100) * 0.6).toFixed(2)})`}">${parse(d).getDate()}</button>`;
    }
    return `<div class="heat">${cells}</div>`;
  }

  function rings(skin, hair) {
    const C1 = 2 * Math.PI * 96, C2 = 2 * Math.PI * 72;
    return `<div class="rings"><div class="orbit"></div><svg viewBox="0 0 220 220">
      <circle cx="110" cy="110" r="96" fill="none" stroke="rgba(60,240,255,0.12)" stroke-width="12"/>
      <circle cx="110" cy="110" r="72" fill="none" stroke="rgba(167,123,255,0.14)" stroke-width="12"/>
      <circle class="ring-arc" cx="110" cy="110" r="96" fill="none" stroke="#3cf0ff" stroke-width="12" stroke-linecap="round" stroke-dasharray="${C1}" stroke-dashoffset="${C1}" data-off="${C1 * (1 - (skin ?? 0) / 100)}" style="filter:drop-shadow(0 0 6px #3cf0ff)"/>
      <circle class="ring-arc" cx="110" cy="110" r="72" fill="none" stroke="#a77bff" stroke-width="12" stroke-linecap="round" stroke-dasharray="${C2}" stroke-dashoffset="${C2}" data-off="${C2 * (1 - (hair ?? 0) / 100)}" style="filter:drop-shadow(0 0 6px #a77bff)"/>
    </svg><div class="center"><div><div class="lbl" style="color:var(--skin)">Skin</div><div class="big num">${skin ?? '—'}</div><div class="lbl" style="color:var(--hair);margin-top:4px">Hair</div><div class="big num">${hair ?? '—'}</div></div></div></div>`;
  }

  const delta = (cur, prev, lowerBetter = false, suffix = ' vs last week') => {
    if (cur == null || prev == null) return `<span class="delta flat">—${suffix}</span>`;
    const d = cur - prev, good = lowerBetter ? d < 0 : d > 0;
    if (Math.abs(d) < 0.5) return `<span class="delta flat">● steady${suffix}</span>`;
    return `<span class="delta ${good ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${Math.abs(round(d, 1))}${suffix}</span>`;
  };
  const demoBanner = () => db.demo ? `<div class="banner"><span>👋 You are looking at <b>45 days of sample data</b> so you can see how the monitor works.</span><button class="btn sm primary" data-act="startFresh">Start tracking my own data</button></div>` : '';

  /* ================= pages ================= */
  const pages = {};
  let heatKey = 'skinScore';

  pages.dash = () => {
    const tl = db.logs[today()], latest = lastLogDate() ? db.logs[lastLogDate()] : null;
    const s7 = avgOver('skinScore', 7), h7 = avgOver('hairScore', 7);
    const sPrev = avgOver('skinScore', 7, addDays(today(), -7)), hPrev = avgOver('hairScore', 7, addDays(today(), -7));
    const word = (c, p) => c == null || p == null ? 'waiting for data' : c - p >= 2 ? 'improving' : c - p <= -2 ? 'having a rough week' : 'steady';
    const f7 = avgOver('fall', 7), st = streak(), ad = avg(lastDays(7).map((d) => adherence(db.logs[d])));
    const heat = zoneHeat(30), topZone = Object.entries(heat).sort((a, b) => b[1] - a[1])[0];
    const hr = new Date().getHours(), greet = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
    const name = db.profile.name ? ', ' + esc(db.profile.name) : '';
    const ins = insights(), d14 = lastDays(14);
    const cards = [
      ['skinScore', 'Skin score', '', s7, sPrev, 0],
      ['hairScore', 'Hair score', '', h7, hPrev, 0],
      ['fall', 'Hair fall', '/day', f7, avgOver('fall', 7, addDays(today(), -7)), 0],
      ['breakouts', 'Breakouts', '/day', avgOver('breakouts', 7), avgOver('breakouts', 7, addDays(today(), -7)), 1],
      ['sleep', 'Sleep', ' h', avgOver('sleep', 7), avgOver('sleep', 7, addDays(today(), -7)), 1],
      ['water', 'Water', ' glasses', avgOver('water', 7), avgOver('water', 7, addDays(today(), -7)), 1],
    ];
    const recentScans = db.scans.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
    return `
    ${demoBanner()}
    <section class="hero">
      <div>
        <span class="eyebrow">${fmtDay(today())} · ${st} day streak</span>
        <h1>${greet}${name}.</h1>
        <p class="lead">Your skin is <b class="grad-text">${word(s7, sPrev)}</b> and your hair is <b class="grad-text">${word(h7, hPrev)}</b>. ${tl ? 'Today is logged.' : 'You have not checked in today yet.'}</p>
        <label class="drop dash-drop mt" id="dashDrop" for="dashFile"><input type="file" accept="image/*" id="dashFile" hidden>
          <span class="drop-orb sm"></span><span><b>Upload a photo to scan</b><br><span class="small muted">Face or hair parting · scanned automatically · 3D model + fix plan</span></span></label>
        <div class="row" style="margin-top:12px"><a class="btn sm ghost" href="#/log">${tl ? 'Edit today\'s check-in' : 'Quick check-in (optional)'}</a></div>
        <div class="hero-chips">
          <span class="pill skin">Skin 7-day avg ${s7 == null ? '—' : Math.round(s7)}</span>
          <span class="pill hair">Hair 7-day avg ${h7 == null ? '—' : Math.round(h7)}</span>
          <span class="pill">Routine ${ad == null ? '—' : Math.round(ad * 100) + '%'}</span>
          <a class="pill" href="#/sleep">☾ Bed by ${bedFor(db.sleep.need)} for ${db.sleep.need} h</a>
          <a class="pill" href="#/fuel">💧 ${tl?.life.water ?? 0} of ${targets().glasses} glasses today</a>
        </div>
      </div>
      <div class="stage" aria-hidden="true">
        <div class="float" style="--d:22;left:calc(50% - 135px);top:calc(50% - 150px);width:270px"><div class="holo"><div class="scanline"></div><div class="lbl">Latest scores · ${latest ? fmtShort(lastLogDate()) : '—'}</div>${rings(skinScore(latest), hairScore(latest))}</div></div>
        <div class="float" style="--d:52;left:0;top:6px;width:178px;z-index:2"><div class="holo" style="--delay:-1.5s"><div class="lbl">Hair fall · 7d</div><div class="big num" style="color:var(--accent)">${f7 == null ? '—' : Math.round(f7)}<span class="small muted">/day</span></div>${spark(series('fall', d14), '#ff4fd8')}</div></div>
        <div class="float hide-sm" style="--d:40;right:0;top:0;width:150px"><div class="holo" style="--delay:-3s;padding:12px"><div class="lbl">Breakout zones</div>${faceMap({ heat })}</div></div>
        <div class="float hide-sm" style="--d:64;right:2%;bottom:6px;width:180px"><div class="holo" style="--delay:-2.2s"><div class="lbl">Streak</div><div class="big num">${st}<span class="small muted"> days</span></div>
          <div class="row" style="gap:5px;margin-top:8px">${lastDays(7).map((d) => `<span style="width:16px;height:16px;border-radius:5px;background:${db.logs[d] ? 'var(--grad)' : 'rgba(255,255,255,.08)'}"></span>`).join('')}</div></div></div>
        <div class="float hide-sm" style="--d:74;left:4%;bottom:0;width:170px"><div class="holo" style="--delay:-4s"><div class="lbl">Routine · 7d</div><div class="big num">${ad == null ? '—' : Math.round(ad * 100) + '%'}</div><div class="bar" style="margin-top:8px"><i style="width:${(ad || 0) * 100}%"></i></div></div></div>
      </div>
    </section>

    <div class="grid g3 section">${cards.map(([k, label, unit, cur, prev, dp]) => `
      <a class="card tilt metric" href="#/trends" style="color:inherit;text-decoration:none">
        <h3><span style="width:8px;height:8px;border-radius:50%;background:${METRICS[k].color}"></span>${label}</h3>
        <div class="v num">${cur == null ? '—' : round(cur, dp)}<small>${unit}</small></div>
        ${delta(cur, prev, METRICS[k].lowerBetter)}
        ${spark(series(k, d14), METRICS[k].color)}
      </a>`).join('')}</div>

    <div class="split section">
      <div class="card"><h3>Insights & alerts</h3><div class="stack">${ins.length ? ins.slice(0, 7).map((i) => `<div class="insight ${i.lv}"><div class="ic">${i.ic}</div><div><b>${esc(i.t)}</b><p>${i.p}</p></div></div>`).join('') : '<p class="muted small">Log a few days and patterns will show up here.</p>'}</div></div>
      <div class="card"><div class="row between"><h3>Today's routine</h3><span class="num small muted">${Math.round((adherence(tl) || 0) * 100)}%</span></div>
        ${routineChecklist(today())}</div>
    </div>

    <div class="grid g2 section">
      <div class="card tilt"><div class="row between"><h3>Last 6 weeks</h3><div class="chips"><button class="chip ${heatKey === 'skinScore' ? 'on' : ''}" data-act="heatKey" data-v="skinScore">Skin</button><button class="chip hair ${heatKey === 'hairScore' ? 'on' : ''}" data-act="heatKey" data-v="hairScore">Hair</button></div></div>
        ${heatmap(heatKey)}<p class="tiny muted" style="margin:12px 0 0">Pink = rough day, cyan = great day. Tap a day to open it.</p></div>
      <div class="card tilt"><h3>Breakout map · 30 days</h3><div class="row" style="gap:20px;flex-wrap:nowrap">
        <div style="flex:1;min-width:0">${faceMap({ heat })}</div>
        <div style="flex:1;min-width:0" class="small">${topZone ? `<p>Most breakouts on your <b style="color:var(--accent)">${ZONES.find((z) => z[0] === topZone[0])[1].toLowerCase()}</b> (${topZone[1]} days).</p><p class="muted tiny">${/chin|jaw/.test(topZone[0]) ? 'Chin and jawline breakouts often follow hormonal cycles.' : /forehead/.test(topZone[0]) ? 'Forehead breakouts can come from hair products, sweat or caps.' : 'Cheek breakouts can come from phone screens, pillowcases or touching your face.'}</p>` : '<p class="muted">No breakouts logged in 30 days.</p>'}</div></div></div>
    </div>

    <div class="card section"><div class="row between"><h3>Latest photo scans</h3><a class="small" href="#/scan">Open scans →</a></div>
      ${recentScans.length ? `<div class="thumbs">${recentScans.map((s) => `<a class="thumb" href="#/scan" data-kind="${s.kind}"><img src="${s.img}" alt="${s.kind} scan ${s.date}"><div><span class="pill ${s.kind}">${s.kind}</span> <span class="muted">${fmtShort(s.date)}</span></div></a>`).join('')}</div>` : '<p class="muted small">No scans yet. A weekly photo makes slow changes visible.</p>'}</div>`;
  };

  function routineChecklist(date) {
    const l = db.logs[date];
    return ['am', 'pm'].map((w) => `<div class="tiny muted" style="margin:12px 0 6px;letter-spacing:.15em">${w === 'am' ? '☀ MORNING' : '☾ NIGHT'}</div><div class="stack" style="gap:6px">${db.routine[w].map((s) => {
      const on = l?.done[w].includes(s.id);
      return `<button class="check ${on ? 'on' : ''}" data-act="done" data-date="${date}" data-w="${w}" data-id="${s.id}" aria-pressed="${!!on}"><span class="box">${on ? '✓' : ''}</span><span class="t">${esc(s.name)}</span>${s.kind === 'hair' ? '<span class="pill hair" style="margin-left:auto">hair</span>' : ''}</button>`;
    }).join('') || '<p class="muted small">No steps. <a href="#/routine">Add some →</a></p>'}</div>`).join('');
  }

  /* ---------- daily check-in ---------- */
  let logDate = today();
  const getPath = (o, p) => p.split('.').reduce((a, k) => a?.[k], o);
  const setPath = (o, p, v) => { const ks = p.split('.'), last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; };
  const draft = () => db.logs[logDate] || newLog();
  const ensureLog = (date = logDate) => (db.logs[date] ||= newLog());

  function slider(path, label, min, max, step, color, ends, unit = '') {
    const v = getPath(draft(), path);
    return `<div class="slider"><div class="row"><label for="in-${path}">${label}</label><span class="val" data-out="${path}">${v}${unit}</span></div>
      <input type="range" id="in-${path}" data-bind="${path}" data-unit="${unit}" min="${min}" max="${max}" step="${step}" value="${v}" style="--c:${color};--p:${((v - min) / (max - min)) * 100}">
      ${ends ? `<div class="scale-ends"><span>${ends[0]}</span><span>${ends[1]}</span></div>` : ''}</div>`;
  }
  const toggle = (path, label) => `<button class="toggle ${getPath(draft(), path) ? 'on' : ''}" data-act="flip" data-path="${path}" aria-pressed="${!!getPath(draft(), path)}">${getPath(draft(), path) ? '✓' : '○'} ${label}</button>`;

  pages.log = (date) => {
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) logDate = date > today() ? today() : date;
    const l = draft(), logged = !!db.logs[logDate], tg = targets(db.profile, l);
    return `${demoBanner()}
    <div class="page-head row between" style="align-items:flex-end">
      <div><span class="eyebrow">Daily check-in</span><h1>${logDate === today() ? 'How is today going?' : fmtDay(logDate)}</h1>
      <p class="small" style="margin:0 0 6px">Optional. A <a href="#/scan">photo scan</a> fills in the skin and scalp parts for you.${l.auto ? ' <span class="pill skin">⚡ filled from today\'s scan</span>' : ''}</p>
      <p class="small" style="margin:0">${logged ? '<span class="pill good">✓ Logged</span>' : '<span class="pill warn">Not logged yet</span> <span class="muted">Change anything to start this day\'s entry.</span>'} <span class="saved" id="saved">● saved</span></p></div>
      <div class="datebar"><button class="btn sm" data-act="day" data-d="-1" aria-label="Previous day">◀</button><input type="date" id="logDate" value="${logDate}" max="${today()}" aria-label="Date"><button class="btn sm" data-act="day" data-d="1" ${logDate >= today() ? 'disabled' : ''} aria-label="Next day">▶</button></div>
    </div>
    ${l.flags.length ? `<div class="insight bad" style="margin-bottom:18px"><div class="ic">⚕</div><div><b>Please see a dermatologist soon</b><p>You ticked a warning sign. These need an in-person check; this tracker can't assess them. For swelling of the face or trouble breathing, call 112.</p></div></div>` : ''}
    <div class="card" style="margin-bottom:18px"><div class="score-live">
      <div class="metric"><span class="tiny muted">SKIN SCORE</span><span class="v num" id="liveSkin" style="color:var(--skin)">${skinScore(l)}</span></div>
      <div class="metric"><span class="tiny muted">HAIR SCORE</span><span class="v num" id="liveHair" style="color:var(--hair)">${hairScore(l)}</span></div>
      <div class="metric"><span class="tiny muted">ROUTINE</span><span class="v num" id="liveRoutine">${Math.round((adherence(l) || 0) * 100)}%</span></div>
      <p class="small muted" style="margin:0;flex:1;min-width:200px;align-self:center">Scores update as you move the sliders. Everything saves automatically.</p></div></div>

    <div class="grid g2">
      <div class="card"><h3><span style="color:var(--skin)">◐</span> Skin</h3>
        ${slider('skin.oil', 'Oiliness', 0, 10, 1, '#3cf0ff', ['Matte', 'Very shiny'])}
        ${slider('skin.dry', 'Dryness / tightness', 0, 10, 1, '#3cf0ff', ['Comfortable', 'Flaky'])}
        ${slider('skin.red', 'Redness', 0, 10, 1, '#3cf0ff', ['None', 'Very red'])}
        ${slider('skin.sens', 'Stinging / sensitivity', 0, 10, 1, '#3cf0ff', ['None', 'Burning'])}
        <label>New or active breakouts</label>
        <div class="stepper"><button data-act="step" data-path="skin.breakouts" data-d="-1" aria-label="Fewer breakouts">−</button><span class="n num">${l.skin.breakouts}</span><button data-act="step" data-path="skin.breakouts" data-d="1" aria-label="More breakouts">+</button></div>
        <label class="mt">Where? Tap the zones</label>
        ${faceMap({ selected: l.skin.zones, edit: true })}
      </div>

      <div class="card"><h3><span style="color:var(--hair)">⌇</span> Hair & scalp</h3>
        <label>Hair fall today (hairs)</label>
        <div class="stepper"><button data-act="step" data-path="hair.fall" data-d="-10" aria-label="Minus 10 hairs">−</button><span class="n num">${l.hair.fall}</span><button data-act="step" data-path="hair.fall" data-d="10" aria-label="Plus 10 hairs">+</button></div>
        <div class="chips" style="margin-top:10px">${[['Under 50', 35], ['50–100', 75], ['100–150', 125], ['150–250', 200], ['250+', 280]].map(([t, v]) => `<button class="chip hair ${l.hair.fall === v ? 'on' : ''}" data-act="set" data-path="hair.fall" data-v="${v}">${t}</button>`).join('')}</div>
        <p class="tiny muted" style="margin-top:8px">Count hairs on your comb, shower drain and pillow. 50–100 a day is normal; wash days run higher.</p>
        ${slider('hair.itch', 'Scalp itch', 0, 10, 1, '#a77bff', ['None', 'Constant'])}
        ${slider('hair.flakes', 'Flakes / dandruff', 0, 10, 1, '#a77bff', ['None', 'Heavy'])}
        ${slider('hair.oil', 'Scalp oiliness', 0, 10, 1, '#a77bff', ['Dry', 'Greasy'])}
        ${slider('hair.frizz', 'Frizz / dry lengths', 0, 10, 1, '#a77bff', ['Smooth', 'Very frizzy'])}
        ${toggle('hair.wash', 'Wash day')}
      </div>

      <div class="card"><h3><span style="color:var(--good)">◌</span> Lifestyle</h3>
        ${slider('life.sleep', 'Sleep last night', 3, 11, 0.5, '#9dff6a', null, ' h')}
        <p class="tiny muted" style="margin:-8px 0 14px">Filled in automatically when you use <a href="#/sleep">Sleep mode</a>.</p>
        ${slider('life.stress', 'Stress', 0, 10, 1, '#ff9de2', ['Calm', 'Overwhelmed'])}
        ${slider('life.sun', 'Time in the sun', 0, 240, 10, '#ffc24b', null, ' min')}
        <div class="row">${toggle('life.junk', 'Junk / sugary food')}${toggle('life.period', 'On my period')}${toggle('life.workout', 'Worked out')}${toggle('life.hot', 'Hot / sweaty day')}</div>
      </div>

      <div class="card"><h3><span style="color:#ffd27a">◍</span> Food & water</h3>
        <label>Meals eaten</label>
        <div class="row">${toggle('life.meals.b', 'Breakfast')}${toggle('life.meals.l', 'Lunch')}${toggle('life.meals.d', 'Dinner')}</div>
        <label class="mt">Protein today (approx. grams) · target ${Math.round(tg.protein)} g</label>
        <div class="stepper"><button data-act="step" data-path="life.protein" data-d="-5" aria-label="Minus 5 grams">−</button><span class="n num">${l.life.protein ?? '—'}</span><button data-act="step" data-path="life.protein" data-d="5" aria-label="Plus 5 grams">+</button></div>
        <p class="tiny muted" style="margin-top:6px">Rough guide: 1 katori dal ≈ 7 g · 2 eggs ≈ 13 g · 100 g paneer ≈ 18 g · 1 cup curd ≈ 7 g · 100 g chicken ≈ 31 g</p>
        <label class="mt">Water (glasses of 250 ml) · target ${tg.glasses}</label>
        <div class="water">${Array.from({ length: Math.max(12, tg.glasses + 2) }, (_, i) => `<button class="${i < l.life.water ? 'on' : ''}" data-act="water" data-v="${i + 1}" aria-label="${i + 1} glasses"></button>`).join('')}</div>
        <p class="tiny muted" style="margin:4px 0 0"><span class="num">${l.life.water}</span> of ${tg.glasses} glasses (${round(l.life.water * 0.25, 2)} of ${round(tg.water, 1)} L)</p>
      </div>

      <div class="card"><h3>☰ Routine</h3>${routineChecklist(logDate)}</div>

      <div class="card"><h3 style="color:var(--bad)">⚕ Warning signs</h3>
        <p class="tiny muted">Tick only if it happened. Any of these triggers a "see a dermatologist" alert.</p>
        <div class="stack" style="gap:6px">${FLAGS.map(([id, t]) => `<button class="check ${l.flags.includes(id) ? 'on' : ''}" data-act="flag" data-id="${id}" aria-pressed="${l.flags.includes(id)}"><span class="box">${l.flags.includes(id) ? '!' : ''}</span><span>${t}</span></button>`).join('')}</div>
      </div>

      <div class="card"><h3>✎ Notes</h3><textarea id="note" data-bind="note" rows="6" placeholder="New product, diet change, travel, how you felt…">${esc(l.note)}</textarea></div>
    </div>`;
  };

  let savedTimer;
  function persist() {
    save();
    const s = $('#saved'); if (s) { s.classList.add('show'); clearTimeout(savedTimer); savedTimer = setTimeout(() => s.classList.remove('show'), 1200); }
  }
  function liveUpdate() {
    const l = draft(), set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
    set('#liveSkin', skinScore(l)); set('#liveHair', hairScore(l)); set('#liveRoutine', Math.round((adherence(l) || 0) * 100) + '%');
  }

  /* ---------- photo scan: auto-detect, 3D relief model, findings & fix plan ---------- */
  const SCAN_LABELS = {
    skin: [['wrinkles', 'Lines', '#7fd3ff'], ['spots', 'Dark spots', '#ff4fd8'], ['redness', 'Redness', '#ff5c7a'], ['shine', 'Shine / oil', '#ffc24b'], ['evenness', 'Tone evenness', '#9dff6a']],
    hair: [['scalp', 'Scalp visible', '#3cf0ff'], ['density', 'Coverage', '#a77bff'], ['flakes', 'Flakes', '#ff4fd8']],
  };
  const FTYPE = {
    acne: ['Inflamed spot', '#ff3b5c'], spots: ['Dark spot', '#ff4fd8'], oil: ['Oily zone', '#ffc24b'], wrinkles: ['Lines', '#7fd3ff'],
    thin: ['Thinner area', '#3cf0ff'], flakes: ['Flakes', '#ff4fd8'],
  };
  // Fix plans: first-line, evidence-based options. Not a prescription.
  const FIXES = {
    acne: {
      title: 'Inflamed spots (likely acne)', color: '#ff3b5c',
      why: 'Clogged pores plus inflammation. Humidity, sweat, friction (phone, mask, pillowcase) and high-glycaemic food can make it worse.',
      am: ['Gentle gel cleanser', 'Niacinamide 4–5% serum', 'Oil-free gel moisturiser', 'Non-comedogenic sunscreen SPF 50'],
      pm: ['Gentle cleanser', 'Adapalene 0.1% gel, pea-sized for the whole face, 3 nights a week at first', 'Benzoyl peroxide 2.5% on active spots (other nights)', 'Light moisturiser'],
      habits: ['Do not pick or squeeze: it leaves marks that last longer than the spot', 'Change pillowcases twice a week and wipe your phone screen', 'Prefer slow carbs (millets, dal, whole grains) over sugary snacks'],
      timeline: 'A small flare in weeks 2–4 is normal. Fewer new spots by weeks 6–8; judge the result at 12 weeks.',
      derm: 'Painful deep lumps, scarring, or no improvement after 12 weeks. Prescription treatments work well.',
      evidence: 'Adapalene and benzoyl peroxide are first-line treatments in the American Academy of Dermatology acne guideline (2024).',
    },
    spots: {
      title: 'Dark marks and uneven tone', color: '#ff4fd8',
      why: 'Extra melanin after acne or sun (post-inflammatory hyperpigmentation). Indian skin is especially prone, and UV keeps it dark.',
      am: ['Gentle cleanser', 'Vitamin C or niacinamide serum', 'Moisturiser', 'Sunscreen SPF 50 PA++++, two finger-lengths, reapplied every 2–3 h outdoors'],
      pm: ['Cleanser', 'Azelaic acid 10–20% or alpha arbutin 2%', 'Moisturiser'],
      habits: ['No lemon, toothpaste or harsh scrubs: irritation makes marks darker', 'Tinted sunscreen also blocks visible light, which worsens melasma', 'Treat active acne first, since every spot can leave a new mark'],
      timeline: 'Marks fade slowly: visible change in 8–12 weeks, 6 months or more for deeper marks.',
      derm: 'Any spot that changes shape or colour, itches or bleeds. Stubborn melasma may need prescription creams.',
      evidence: 'Daily broad-spectrum sunscreen, azelaic acid and niacinamide have trial evidence for hyperpigmentation.',
    },
    wrinkles: {
      title: 'Fine lines and wrinkles', color: '#7fd3ff',
      why: 'Mostly sun damage (photo-ageing), repeated expressions and natural collagen loss with age. Dry skin makes lines look deeper.',
      am: ['Gentle cleanser', 'Vitamin C serum (10–20% L-ascorbic acid or a gentler derivative)', 'Moisturiser with ceramides or hyaluronic acid', 'Broad-spectrum sunscreen SPF 50 PA++++, every day'],
      pm: ['Gentle cleanser', 'Retinol 0.25–0.5%, 2–3 nights a week at first, building up slowly', 'Moisturiser with peptides or ceramides'],
      habits: ['Daily sunscreen is the most proven anti-ageing step', 'Sleep 7+ hours and avoid smoking', 'Dehydration lines plump up within days of regular moisturising'],
      timeline: 'Hydration softens fine lines within 1–2 weeks; retinoids need 12 weeks or more to visibly reduce wrinkles.',
      derm: 'Deep or static lines: prescription tretinoin, peels, lasers or injectables are options. Not for use in pregnancy (retinoids).',
      evidence: 'Topical retinoids have randomised-trial evidence for photo-ageing, and daily sunscreen slowed skin ageing in a 4.5-year trial (Hughes et al., Ann Intern Med 2013).',
    },
    oil: {
      title: 'Oily zones', color: '#ffc24b',
      why: 'Sebum production is mostly genetic and hormonal, and heat and humidity increase it.',
      am: ['Gel or foaming cleanser', 'Niacinamide + zinc serum', 'Oil-free gel moisturiser', 'Matte gel sunscreen'],
      pm: ['Cleanser', 'Salicylic acid 2%, 2–3 nights a week', 'Light gel moisturiser'],
      habits: ['Do not skip moisturiser: stripped skin can feel tight and still be oily', 'Use blotting paper instead of washing 4–5 times a day', 'A clay mask once a week at most'],
      timeline: 'Shine usually drops within 2–4 weeks of consistent use.',
      derm: 'Greasy, red, flaky patches around the nose and eyebrows may be seborrhoeic dermatitis.',
      evidence: 'Topical 2% niacinamide reduced sebum in a controlled study (Draelos et al., 2006).',
    },
    red: {
      title: 'Redness and irritation', color: '#ff8f6b',
      why: 'Often a stressed skin barrier from too many actives, hot water, fragrance or sun.',
      am: ['Rinse with water or a cream cleanser', 'Ceramide moisturiser', 'Mineral sunscreen (zinc oxide)'],
      pm: ['Gentle cleanser', 'Ceramide or centella moisturiser'],
      habits: ['Pause scrubs, acids and retinoids for 1–2 weeks', 'Use fragrance-free products and patch test anything new', 'Lukewarm water, never hot'],
      timeline: 'Irritation usually calms within 1–2 weeks once the trigger stops.',
      derm: 'Persistent flushing, visible vessels or bumps (possible rosacea), or a rash that spreads, blisters or itches badly.',
      evidence: 'Ceramide-containing moisturisers repair the barrier and reduce water loss.',
    },
    thin: {
      title: 'Visible scalp / thinning', color: '#3cf0ff',
      why: 'Common causes are pattern hair loss, shedding after stress, illness or crash dieting (telogen effluvium), and low iron, vitamin D, B12 or thyroid problems.',
      am: ['Loose hairstyles: avoid tight buns and ponytails'],
      pm: ['Gentle scalp massage, 4 minutes', 'Minoxidil, only after a dermatologist confirms pattern hair loss'],
      habits: ['Eat enough protein every day (see Fuel) and avoid crash diets', 'Ask your doctor for ferritin, vitamin D, B12 and thyroid (TSH) tests', 'Rescan the same parting every 2 weeks in the same light'],
      timeline: 'Hair grows about 1 cm a month, so real change shows after 3–6 months.',
      derm: 'Sudden shedding in clumps, round bald patches, or scalp pain, redness or scarring.',
      evidence: 'Minoxidil is the best-studied over-the-counter treatment for pattern hair loss; low iron and vitamin D are linked with shedding.',
    },
    flakes: {
      title: 'Flakes / dandruff', color: '#d5c2ff',
      why: 'Mostly an overgrowth of Malassezia yeast feeding on scalp oil.',
      am: [],
      pm: ['Anti-dandruff shampoo with ketoconazole 2% or zinc pyrithione, 2–3 times a week; leave the lather on for 5 minutes', 'Conditioner on the lengths only'],
      habits: ['Do not leave oil on the scalp overnight: it feeds the yeast', 'Wash after heavy sweating or workouts'],
      timeline: 'Flakes usually improve within 2–4 weeks.',
      derm: 'Thick silvery scales, red patches spreading to the face, or bleeding.',
      evidence: 'Ketoconazole and zinc pyrithione shampoos reduced dandruff in controlled trials.',
    },
  };
  const ZONE_NAME = Object.fromEntries(ZONES.map(([id, label]) => [id, label]));
  ZONE_NAME.parting = 'Parting'; ZONE_NAME.scalp = 'Scalp';

  let scanKind = 'auto', current = null, pendingFile = null, cmp = [], layer = 'all', relief = 1, busy = false;

  function dilate(m, w, h) {
    const o = new Uint8Array(m.length);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (m[i] || m[i - 1] || m[i + 1] || m[i - w] || m[i + w]) o[i] = 1; }
    return o;
  }
  function blobs(mask, w, h, minA, maxA) {
    const seen = new Uint8Array(w * h), q = new Int32Array(w * h), out = [];
    for (let i = 0; i < w * h; i++) {
      if (!mask[i] || seen[i]) continue;
      let qh = 0, qt = 0, sx = 0, sy = 0, n = 0; q[qt++] = i; seen[i] = 1;
      while (qh < qt) {
        const p = q[qh++], x = p % w, y = (p / w) | 0; sx += x; sy += y; n++;
        if (x > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; q[qt++] = p - 1; }
        if (x < w - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; q[qt++] = p + 1; }
        if (y > 0 && mask[p - w] && !seen[p - w]) { seen[p - w] = 1; q[qt++] = p - w; }
        if (y < h - 1 && mask[p + w] && !seen[p + w]) { seen[p + w] = 1; q[qt++] = p + w; }
      }
      if (n >= minA && n <= maxA) out.push({ x: sx / n, y: sy / n, n });
    }
    return out.sort((a, b) => b.n - a.n);
  }
  // nearby fragments of the same spot are merged into one finding
  function merge(list, dist) {
    const out = [];
    for (const b of list) {
      const m = out.find((o) => Math.hypot(o.x - b.x, o.y - b.y) < dist);
      if (m) { const n = m.n + b.n; m.x = (m.x * m.n + b.x * b.n) / n; m.y = (m.y * m.n + b.y * b.n) / n; m.n = n; } else out.push({ ...b });
    }
    return out.sort((a, b) => b.n - a.n);
  }
  function zoneOf(px, py, bb) {
    const u = (px - bb.x0) / Math.max(1, bb.x1 - bb.x0), v = (py - bb.y0) / Math.max(1, bb.y1 - bb.y0);
    if (v < 0.28) return 'forehead';
    if (v > 0.82) return u < 0.3 ? 'jawL' : u > 0.7 ? 'jawR' : 'chin';
    if (v > 0.66 && (u < 0.25 || u > 0.75)) return u < 0.5 ? 'jawL' : 'jawR';
    if (u > 0.38 && u < 0.62) return 'nose';
    return u < 0.5 ? 'cheekL' : 'cheekR';
  }
  // eyes, nostrils and lips look like "dark" or "red" spots, so they are skipped
  const featureZone = (u, v) => (v > 0.3 && v < 0.5 && ((u > 0.1 && u < 0.45) || (u > 0.55 && u < 0.9))) || (v > 0.55 && v < 0.68 && u > 0.36 && u < 0.64) || (v > 0.68 && v < 0.86 && u > 0.3 && u < 0.7);

  function skinFindings(res, W, H) {
    const bb = res.bbox, fw = Math.max(1, bb.x1 - bb.x0), fh = Math.max(1, bb.y1 - bb.y0), fA = fw * fh;
    // a real spot sits on skin: check a ring around it (the spot itself may not read as skin)
    const onSkin = (b) => { const r = Math.sqrt(b.n / Math.PI) + 5; let n = 0; for (let k = 0; k < 8; k++) { const x = Math.round(b.x + r * Math.cos(k * Math.PI / 4)), y = Math.round(b.y + r * Math.sin(k * Math.PI / 4)); if (x >= 0 && y >= 0 && x < W && y < H && res.skin[y * W + x]) n++; } return n >= 5; };
    const keep = (b) => { const u = (b.x - bb.x0) / fw, v = (b.y - bb.y0) / fh; return u >= 0 && u <= 1 && v >= 0 && v <= 1 && !featureZone(u, v) && onSkin(b); };
    const minA = Math.max(5, fA * 0.0002), maxA = fA * 0.02;
    const tag = (type) => (b) => ({ ...b, type, zone: zoneOf(b.x, b.y, bb) });
    const md = fw * 0.045;
    const acne = merge(blobs(dilate(res.masks.red, W, H), W, H, minA / 2, maxA), md).filter((b) => b.n >= minA).filter(keep).slice(0, 10).map(tag('acne'));
    const spots = merge(blobs(dilate(res.masks.spots, W, H), W, H, minA / 2, maxA), md).filter((b) => b.n >= minA).filter(keep).filter((b) => !acne.some((a) => Math.hypot(a.x - b.x, a.y - b.y) < md)).slice(0, 8).map(tag('spots'));
    const oil = blobs(dilate(dilate(res.masks.shine, W, H), W, H), W, H, fA * 0.004, fA * 0.5).slice(0, 3).map(tag('oil'));
    return [...acne, ...spots, ...oil];
  }
  function hairFindings(res, W, H) {
    const G = 6, cw = W / G, ch = H / G, cells = [];
    for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
      let s = 0, n = 0;
      for (let y = Math.floor(gy * ch); y < Math.floor((gy + 1) * ch); y++) for (let x = Math.floor(gx * cw); x < Math.floor((gx + 1) * cw); x++) { s += res.masks.scalp[y * W + x]; n++; }
      cells.push({ x: (gx + 0.5) * cw, y: (gy + 0.5) * ch, r: s / n });
    }
    const mean = avg(cells.map((c) => c.r));
    const thin = cells.filter((c) => c.r > Math.max(0.3, mean * 1.4)).sort((a, b) => b.r - a.r).slice(0, 4).map((c) => ({ ...c, n: Math.round(c.r * 100), type: 'thin', zone: 'parting' }));
    const flakes = merge(blobs(dilate(res.masks.flakes, W, H), W, H, 2, W * H * 0.01), W * 0.06).slice(0, 6).map((b) => ({ ...b, type: 'flakes', zone: 'scalp' }));
    return [...thin, ...flakes];
  }
  function issuesFrom(kind, s, finds) {
    const n = (t) => finds.filter((f) => f.type === t).length, out = [];
    if (kind === 'skin') {
      if (n('acne') >= 2 || s.redness >= 40) out.push('acne');
      if (n('spots') >= 3 || s.spots >= 40 || s.evenness < 55) out.push('spots');
      if ((n('oil') && s.shine >= 25) || s.shine >= 45) out.push('oil');
      if (s.redness >= 55) out.push('red');
    } else {
      if (s.scalp >= 22 || n('thin')) out.push('thin');
      if (s.flakes >= 12 || n('flakes') >= 3) out.push('flakes');
    }
    return out;
  }
  function analyzePhoto(cv, forced) {
    const W = cv.width, H = cv.height, ctx = cv.getContext('2d', { willReadFrequently: true });
    const sk = analyzeSkin(ctx, W, H);
    const faceLike = sk.scores && sk.bbox && sk.coverage >= 0.12 && (sk.bbox.x1 - sk.bbox.x0) / W >= 0.3;
    let kind = forced && forced !== 'auto' ? forced : faceLike ? 'skin' : 'hair';
    let res = kind === 'skin' ? sk : analyzeHair(ctx, W, H);
    if (!res.scores && !forced) { kind = kind === 'skin' ? 'hair' : 'skin'; res = kind === 'skin' ? sk : analyzeHair(ctx, W, H); }
    if (!res.scores) return null;
    const findings = kind === 'skin' ? skinFindings(res, W, H) : hairFindings(res, W, H);
    return { kind, W, H, base: ctx.getImageData(0, 0, W, H), masks: res.masks, skin: res.skin, bbox: res.bbox, scores: res.scores, findings, issues: issuesFrom(kind, res.scores, findings), thumb: toThumb(cv) };
  }
  function applyScanToLog(cur) {
    const l = ensureLog(today());
    if (cur.kind === 'skin') {
      const acne = cur.findings.filter((f) => f.type === 'acne');
      l.skin.breakouts = acne.length; l.skin.zones = [...new Set(acne.map((f) => LOG_ZONE[f.zone] || f.zone).filter((z) => ZONES.some((x) => x[0] === z)))];
      l.skin.red = Math.round(clamp(cur.scores.redness / 10, 0, 10)); l.skin.oil = Math.round(clamp(cur.scores.shine / 10, 0, 10));
    } else l.hair.flakes = Math.round(clamp(cur.scores.flakes / 10, 0, 10));
    l.auto = { ...(l.auto || {}), [cur.kind]: Date.now() };
  }

  /* height map + texture for the 3D model */
  function relieve(cur) {
    const { W, H, base, masks, kind } = cur, d = base.data, gw = 150, gh = Math.max(2, Math.round((gw * H) / W));
    const lum = new Float32Array(gw * gh), body = new Float32Array(gw * gh), issue = new Float32Array(gw * gh), cnt = new Float32Array(gw * gh);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, g = Math.min(gh - 1, Math.floor((y / H) * gh)) * gw + Math.min(gw - 1, Math.floor((x / W) * gw));
      const L = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
      lum[g] += L; cnt[g]++;
      if (kind === 'skin') { body[g] += masks.red ? (cur.skin?.[i] ? 1 : 0) : 0; issue[g] += (masks.red[i] ? 1 : 0) + (masks.spots[i] ? 0.7 : 0); }
      else { body[g] += L < 0.45 ? 1 : 0; issue[g] += masks.scalp[i] ? 1 : 0; }
    }
    for (let g = 0; g < gw * gh; g++) { const c = cnt[g] || 1; lum[g] /= c; body[g] /= c; issue[g] /= c; }
    const blur = (a, r, passes) => {
      let src = a;
      for (let p = 0; p < passes; p++) {
        const out = new Float32Array(src.length);
        for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
          let s = 0, n = 0;
          for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const yy = y + dy, xx = x + dx; if (yy < 0 || yy >= gh || xx < 0 || xx >= gw) continue; s += src[yy * gw + xx]; n++; }
          out[y * gw + x] = s / n;
        }
        src = out;
      }
      return src;
    };
    const dome = blur(body, 4, 3), iss = blur(issue, 1, 1), det = blur(lum, 1, 1);
    const baseZ = new Float32Array(gw * gh), issueZ = new Float32Array(gw * gh);
    for (let g = 0; g < gw * gh; g++) {
      baseZ[g] = kind === 'skin' ? 0.34 * Math.pow(dome[g], 0.75) + 0.05 * (det[g] - 0.5) * dome[g] : 0.16 * dome[g] + 0.03 * (det[g] - 0.5);
      issueZ[g] = kind === 'skin' ? 0.16 * Math.min(1, iss[g] * 2.5) : -0.12 * Math.min(1, iss[g] * 1.5);
    }
    return { gw, gh, baseZ, issueZ };
  }
  function scanTexture(cur, lay) {
    if (cur.mesh) return faceTexture(cur, lay);
    const { W, H, base, masks, kind } = cur, c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d'), im = new ImageData(new Uint8ClampedArray(base.data), W, H), d = im.data;
    const tint = (i, rgb, a) => { d[i * 4] = d[i * 4] * (1 - a) + rgb[0] * a; d[i * 4 + 1] = d[i * 4 + 1] * (1 - a) + rgb[1] * a; d[i * 4 + 2] = d[i * 4 + 2] * (1 - a) + rgb[2] * a; };
    const on = (k) => lay === 'all' || lay === k;
    for (let i = 0; i < W * H; i++) {
      if (kind === 'skin') {
        if (!cur.skin?.[i]) { d[i * 4] *= 0.35; d[i * 4 + 1] *= 0.35; d[i * 4 + 2] *= 0.45; continue; }
        if (on('acne') && masks.red[i]) tint(i, [255, 40, 80], 0.7);
        else if (on('spots') && masks.spots[i]) tint(i, [255, 79, 216], 0.6);
        else if (on('oil') && masks.shine[i]) tint(i, [255, 194, 75], 0.55);
      } else {
        if (on('thin') && masks.scalp[i]) tint(i, [60, 240, 255], 0.45);
        if (on('flakes') && masks.flakes[i]) tint(i, [255, 79, 216], 0.9);
      }
    }
    ctx.putImageData(im, 0, 0); return c;
  }

  /* ---------- face landmark model (MediaPipe Face Landmarker, loaded on first scan) ---------- */
  const MP_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
  let FL = null, landmarker = null, lmLoading = null, lmFailed = false;
  // the model ships as a binary .task file; hosts that cannot serve that type get a base64 text copy instead
  async function modelBytes(base) {
    try { const r = await fetch(base + 'face_landmarker.task'); if (r.ok) return new Uint8Array(await r.arrayBuffer()); } catch {}
    const bin = atob((await (await fetch(base + 'face_landmarker.task.b64.txt')).text()).trim()), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  function loadLandmarker() {
    if (landmarker || lmFailed) return Promise.resolve(landmarker);
    return (lmLoading ||= (async () => {
      try {
        const mod = await import(MP_CDN + '/vision_bundle.mjs');
        FL = mod.FaceLandmarker;
        const base = new URL('vendor/mediapipe/', document.baseURI).href;
        landmarker = await FL.createFromOptions(
          { wasmLoaderPath: MP_CDN + '/wasm/vision_wasm_internal.js', wasmBinaryPath: base + 'vision_wasm_internal.wasm' },
          { baseOptions: { modelAssetBuffer: await modelBytes(base), delegate: 'CPU' }, runningMode: 'IMAGE', numFaces: 1 });
      } catch (e) { console.warn('Face landmark model unavailable; using colour analysis only.', e); lmFailed = true; landmarker = null; }
      return landmarker;
    })());
  }

  const hull = (pts) => {
    const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y), cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x), lo = [], up = [];
    for (const q of p) { while (lo.length >= 2 && cr(lo.at(-2), lo.at(-1), q) <= 0) lo.pop(); lo.push(q); }
    for (const q of p.slice().reverse()) { while (up.length >= 2 && cr(up.at(-2), up.at(-1), q) <= 0) up.pop(); up.push(q); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  };
  const idxOf = (conns) => [...new Set(conns.flatMap((c) => [c.start, c.end]))];
  const pathPoly = (x, pts) => { x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y))); x.closePath(); };
  function maskFrom(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d', { willReadFrequently: true }); draw(x);
    const d = x.getImageData(0, 0, w, h).data, m = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) m[i] = d[i * 4 + 3] > 127 && d[i * 4] > 127 ? 1 : 0;
    return m;
  }
  const SRGB = Array.from({ length: 256 }, (_, c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  const labF = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  function toLab(r, g, b, out, i) {
    const R = SRGB[r], G = SRGB[g], B = SRGB[b];
    const fx = labF((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047), fy = labF(R * 0.2126 + G * 0.7152 + B * 0.0722), fz = labF((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
    out[0][i] = 116 * fy - 16; out[1][i] = 500 * (fx - fy); out[2][i] = 200 * (fy - fz);
  }
  // mean of v over masked pixels in a (2r+1)^2 window, via integral images
  function maskedBlur(v, m, w, h, r) {
    const W1 = w + 1, I = new Float64Array(W1 * (h + 1)), C = new Float64Array(W1 * (h + 1)), out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) { let sv = 0, sc = 0; for (let x = 0; x < w; x++) { const i = y * w + x; sv += m[i] ? v[i] : 0; sc += m[i]; I[(y + 1) * W1 + x + 1] = I[y * W1 + x + 1] + sv; C[(y + 1) * W1 + x + 1] = C[y * W1 + x + 1] + sc; } }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(w, x + r + 1), y1 = Math.min(h, y + r + 1);
      const s = I[y1 * W1 + x1] - I[y0 * W1 + x1] - I[y1 * W1 + x0] + I[y0 * W1 + x0], c = C[y1 * W1 + x1] - C[y0 * W1 + x1] - C[y1 * W1 + x0] + C[y0 * W1 + x0];
      out[y * w + x] = c ? s / c : v[y * w + x];
    }
    return out;
  }
  function boxBlur(v, w, h, r) {
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, n = 0; for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < w) { s += v[y * w + xx]; n++; } } tmp[y * w + x] = s / n; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, n = 0; for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < h) { s += tmp[yy * w + x]; n++; } } out[y * w + x] = s / n; }
    return out;
  }
  // connected components with bounding box and pixel list
  function comps(mask, w, h, minA, maxA) {
    const seen = new Uint8Array(w * h), q = new Int32Array(w * h), out = [];
    for (let i = 0; i < w * h; i++) {
      if (!mask[i] || seen[i]) continue;
      let qh = 0, qt = 0, x0 = w, x1 = 0, y0 = h, y1 = 0, sx = 0, sy = 0; q[qt++] = i; seen[i] = 1;
      while (qh < qt) {
        const p = q[qh++], x = p % w, y = (p / w) | 0; sx += x; sy += y;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (const np of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1, x > 0 && y > 0 ? p - w - 1 : -1, x < w - 1 && y > 0 ? p - w + 1 : -1, x > 0 && y < h - 1 ? p + w - 1 : -1, x < w - 1 && y < h - 1 ? p + w + 1 : -1]) {
          if (np >= 0 && mask[np] && !seen[np]) { seen[np] = 1; q[qt++] = np; }
        }
      }
      const n = qt; if (n < minA || n > maxA) continue;
      out.push({ x: sx / n, y: sy / n, n, bw: x1 - x0 + 1, bh: y1 - y0 + 1, px: q.slice(0, qt) });
    }
    return out;
  }

  const WRINKLE_REGIONS = {
    forehead: ['Forehead lines', 'h'], glabella: ['Frown lines (between brows)', 'v'], crowL: ["Crow's feet (left)", 'any'], crowR: ["Crow's feet (right)", 'any'],
    eyeL: ['Under-eye lines (left)', 'h'], eyeR: ['Under-eye lines (right)', 'h'], nasoL: ['Smile line (left)', 'any'], nasoR: ['Smile line (right)', 'any'],
  };
  const SEV = (s) => (s < 18 ? 'none' : s < 38 ? 'mild' : s < 62 ? 'moderate' : 'marked');
  const ZONE_ANCHORS = { forehead: [151, 108, 337, 10], glabella: [9, 8], nose: [4, 5, 195, 1], cheekL: [50, 101, 205, 123], cheekR: [280, 330, 425, 352], chin: [152, 199, 175, 18], jawL: [172, 136, 150, 58], jawR: [397, 365, 379, 288], underEyeL: [119, 118, 117], underEyeR: [348, 347, 346], templeL: [127, 162, 139], templeR: [356, 389, 368] };
  Object.assign(ZONE_NAME, { glabella: 'Between brows', underEyeL: 'Under left eye', underEyeR: 'Under right eye', templeL: 'Left eye corner', templeR: 'Right eye corner' });
  const LOG_ZONE = { glabella: 'forehead', underEyeL: 'cheekL', underEyeR: 'cheekR', templeL: 'cheekL', templeR: 'cheekR' };

  /* Full face analysis guided by 478 landmarks: dark spots, red spots, shine and wrinkles. */
  function analyzeFace(full, lmN) {
    const FW = full.width, FH = full.height, P = lmN.map((p) => ({ x: p.x * FW, y: p.y * FH, z: p.z * FW }));
    const ovalIdx = idxOf(FL.FACE_LANDMARKS_FACE_OVAL), ovP = ovalIdx.map((i) => P[i]);
    const bx0 = Math.min(...ovP.map((p) => p.x)), bx1 = Math.max(...ovP.map((p) => p.x)), by0 = Math.min(...ovP.map((p) => p.y)), by1 = Math.max(...ovP.map((p) => p.y));
    const mg = (bx1 - bx0) * 0.06, cx0 = Math.max(0, bx0 - mg), cy0 = Math.max(0, by0 - mg), cx1 = Math.min(FW, bx1 + mg), cy1 = Math.min(FH, by1 + mg);
    const s = Math.min(2, 440 / (cx1 - cx0)), aw = Math.round((cx1 - cx0) * s), ah = Math.round((cy1 - cy0) * s);
    const A = document.createElement('canvas'); A.width = aw; A.height = ah;
    const actx = A.getContext('2d', { willReadFrequently: true }); actx.drawImage(full, cx0, cy0, cx1 - cx0, cy1 - cy0, 0, 0, aw, ah);
    const Q = P.map((p) => ({ x: (p.x - cx0) * s, y: (p.y - cy0) * s })), fw = (bx1 - bx0) * s;
    const ipd = P[468] && P[473] ? Math.hypot(P[468].x - P[473].x, P[468].y - P[473].y) * s : fw * 0.45, pxMm = ipd / 63; // average adult interpupillary distance ≈ 63 mm
    const G = (conns) => idxOf(conns).map((i) => Q[i]);
    const feats = [[FL.FACE_LANDMARKS_LEFT_EYE, 0.05], [FL.FACE_LANDMARKS_RIGHT_EYE, 0.05], [FL.FACE_LANDMARKS_LEFT_EYEBROW, 0.03], [FL.FACE_LANDMARKS_RIGHT_EYEBROW, 0.03], [FL.FACE_LANDMARKS_LIPS, 0.03]];
    const region = maskFrom(aw, ah, (x) => {
      x.fillStyle = '#fff'; pathPoly(x, hull(ovalIdx.map((i) => Q[i]))); x.fill();
      x.fillStyle = '#000'; x.strokeStyle = '#000'; x.lineJoin = 'round';
      feats.forEach(([c, d]) => { pathPoly(x, hull(G(c))); x.fill(); x.lineWidth = fw * d * 2; x.stroke(); });
      [98, 327, 2].forEach((i) => { x.beginPath(); x.arc(Q[i].x, Q[i].y, fw * 0.04, 0, 7); x.fill(); });
      [129, 358, 49, 279, 64, 294].forEach((i) => { x.beginPath(); x.arc(Q[i].x, Q[i].y, fw * 0.045, 0, 7); x.fill(); }); // nose-wing creases
      x.lineWidth = fw * 0.03; pathPoly(x, hull(ovalIdx.map((i) => Q[i]))); x.stroke(); // keep away from the hairline/jaw edge
    });
    const data = actx.getImageData(0, 0, aw, ah).data, N = aw * ah, L = new Float32Array(N), Aa = new Float32Array(N), Bb = new Float32Array(N), lab = [L, Aa, Bb], mask = new Uint8Array(N);
    let mN = 0;
    for (let i = 0; i < N; i++) {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]; toLab(r, g, b, lab, i);
      const Y = 0.299 * r + 0.587 * g + 0.114 * b, cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b, cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      if (region[i] && Y > 30 && cb > 70 && cb < 135 && cr > 128 && cr < 185) { mask[i] = 1; mN++; }
    }
    if (mN < N * 0.1) return null;
    const rb = Math.max(4, Math.round(fw * 0.05));
    const Lb = maskedBlur(L, mask, aw, ah, rb), ab = maskedBlur(Aa, mask, aw, ah, rb), bb = maskedBlur(Bb, mask, aw, ah, rb);
    const dark = new Uint8Array(N), red = new Uint8Array(N), shine = new Uint8Array(N);
    let redN = 0, shineN = 0, dev = 0;
    for (let i = 0; i < N; i++) {
      if (!mask[i]) continue;
      const dL = Lb[i] - L[i], da = Aa[i] - ab[i]; dev += Math.abs(dL);
      if (dL > 5.5) dark[i] = 1;
      if (da > 6 && dL > -3) { red[i] = 1; redN++; }
      if (L[i] - Lb[i] > 11 && Math.hypot(Aa[i], Bb[i]) < Math.hypot(ab[i], bb[i]) * 0.8) { shine[i] = 1; shineN++; }
    }
    const ringOnSkin = (c) => { const rr = Math.sqrt(c.n / Math.PI) + fw * 0.03; let k = 0; for (let t = 0; t < 12; t++) { const x = Math.round(c.x + rr * Math.cos((t * Math.PI) / 6)), y = Math.round(c.y + rr * Math.sin((t * Math.PI) / 6)); if (x >= 0 && y >= 0 && x < aw && y < ah && mask[y * aw + x]) k++; } return k >= 12; };
    const minA = Math.PI * (pxMm * 0.95) ** 2;   // spots smaller than ~2 mm are mostly pores, stubble or noise
    const stat = (c, arrA, arrB) => c.px.reduce((acc, p) => acc + (arrA[p] - arrB[p]), 0) / c.n;
    const round_ = (c) => Math.max(c.bw, c.bh) / Math.max(1, Math.min(c.bw, c.bh)) < 2 && c.n / (c.bw * c.bh) > 0.45;
    const toImg = (c) => ({ x: cx0 + c.x / s, y: cy0 + c.y / s });
    const zoneAt = (ix, iy) => { let best = null, bd = Infinity; for (const [z, ids] of Object.entries(ZONE_ANCHORS)) for (const i of ids) { const d = Math.hypot(P[i].x - ix, P[i].y - iy); if (d < bd) { bd = d; best = z; } } return best; };
    // a true spot is darker than skin on (nearly) every side; one-sided shading near the nose or jaw is not
    const surrounded = (c, arr, sign, minD) => {
      const mean = c.px.reduce((acc, p) => acc + arr[p], 0) / c.n, rr = Math.sqrt(c.n / Math.PI) + Math.max(2, fw * 0.008); let k = 0;
      for (let t = 0; t < 16; t++) { const x = Math.round(c.x + rr * Math.cos((t * Math.PI) / 8)), y = Math.round(c.y + rr * Math.sin((t * Math.PI) / 8)); if (x >= 0 && y >= 0 && x < aw && y < ah && sign * (arr[y * aw + x] - mean) > minD) k++; }
      return k >= 13;
    };
    const maxSpot = Math.PI * (pxMm * 3.5) ** 2;
    const acneC = comps(red, aw, ah, minA, maxSpot).filter(round_).filter(ringOnSkin).filter((c) => surrounded(c, Aa, -1, 3)).sort((a, b) => b.n - a.n).slice(0, 12);
    const spotC = comps(dark, aw, ah, minA, maxSpot).filter(round_).filter(ringOnSkin).filter((c) => surrounded(c, L, 1, 4.5)).filter((c) => !acneC.some((a) => Math.hypot(a.x - c.x, a.y - c.y) < Math.sqrt(a.n) + Math.sqrt(c.n))).sort((a, b) => b.n - a.n).slice(0, 12);
    const spotPx = spotC.reduce((a, c) => a + c.n, 0);
    const mm = (c) => round((2 * Math.sqrt(c.n / Math.PI)) / pxMm, 1);
    const findings = [];
    acneC.forEach((c) => { const p = toImg(c); findings.push({ ...p, n: c.n, type: 'acne', zone: zoneAt(p.x, p.y), mm: mm(c), detail: `${mm(c)} mm · red` }); });
    spotC.forEach((c) => { const p = toImg(c), brown = stat(c, Bb, bb) > 1.5; findings.push({ ...p, n: c.n, type: 'spots', zone: zoneAt(p.x, p.y), mm: mm(c), detail: `${mm(c)} mm · ${brown ? 'brown' : 'dark'} · ${round(stat(c, Lb, L), 0)} ΔL` }); });

    /* wrinkles: dark, thin, elongated valleys found with a Hessian (second-derivative) filter inside landmark-defined regions */
    const sig = Math.max(1, Math.round(fw / 220)), Gs = boxBlur(boxBlur(L, aw, ah, sig), aw, ah, sig), h = Math.max(1, sig + 1);
    const ridge = new Float32Array(N), ang = new Float32Array(N), vals = [];
    for (let y = h; y < ah - h; y++) for (let x = h; x < aw - h; x++) {
      const i = y * aw + x; if (!mask[i]) continue;
      const Ixx = Gs[i + h] - 2 * Gs[i] + Gs[i - h], Iyy = Gs[i + h * aw] - 2 * Gs[i] + Gs[i - h * aw];
      const Ixy = (Gs[i + h + h * aw] - Gs[i + h - h * aw] - Gs[i - h + h * aw] + Gs[i - h - h * aw]) / 4;
      const tr = Ixx + Iyy, dt = Math.sqrt((Ixx - Iyy) ** 2 + 4 * Ixy * Ixy), l1 = (tr + dt) / 2, l2 = (tr - dt) / 2;
      if (l1 > 0 && Math.abs(l2) < l1 * 0.5) { ridge[i] = l1 - Math.abs(l2); ang[i] = 0.5 * Math.atan2(2 * Ixy, Ixx - Iyy) + Math.PI / 2; vals.push(ridge[i]); }
    }
    vals.sort((a, b) => a - b);
    const thr = Math.max(0.55 * h, vals[Math.floor(vals.length * 0.9)] || 0);
    const up = fw * 0.07, P2 = (i, dx = 0, dy = 0) => ({ x: Q[i].x + dx, y: Q[i].y + dy });
    const outward = (i) => (Q[i].x < Q[168].x ? -1 : 1);
    const lidL = [33, 7, 163, 144, 145, 153, 154, 155, 133], lidR = [263, 249, 390, 373, 374, 380, 381, 382, 362];
    const crow = (c, t) => { const o = outward(c), xa = Q[c].x + o * fw * 0.02, xb = Q[t].x - o * fw * 0.005; return [{ x: xa, y: Q[c].y - fw * 0.07 }, { x: xb, y: Q[c].y - fw * 0.07 }, { x: xb, y: Q[c].y + fw * 0.1 }, { x: xa, y: Q[c].y + fw * 0.1 }]; };
    const naso = (a, b) => { const o = outward(a); return [P2(a, o * fw * 0.01), P2(b, o * fw * 0.01, fw * 0.02), P2(b, o * fw * 0.08), P2(a, o * fw * 0.08)]; };
    const polys = {
      forehead: hull([54, 103, 67, 109, 10, 338, 297, 332, 284, 300, 293, 334, 296, 336, 107, 66, 105, 63, 70].map((i) => Q[i])),
      glabella: hull([P2(107), P2(336), P2(9), P2(8), P2(55), P2(285), P2(9, 0, -up)]),
      crowL: crow(33, 127), crowR: crow(263, 356),
      eyeL: hull([...lidL.map((i) => P2(i, 0, fw * 0.02)), ...lidL.map((i) => P2(i, 0, fw * 0.11))]),
      eyeR: hull([...lidR.map((i) => P2(i, 0, fw * 0.02)), ...lidR.map((i) => P2(i, 0, fw * 0.11))]),
      nasoL: naso(129, 61), nasoR: naso(358, 291),
    };
    const wr = new Uint8Array(N), regions = [];
    for (const [key, poly] of Object.entries(polys)) {
      const rm = maskFrom(aw, ah, (x) => { x.fillStyle = '#fff'; pathPoly(x, poly); x.fill(); });
      const dir = WRINKLE_REGIONS[key][1], m = new Uint8Array(N); let area = 0;
      for (let i = 0; i < N; i++) {
        if (!rm[i] || !mask[i]) continue; area++;
        if (ridge[i] < thr) continue;
        let a = ang[i] % Math.PI; if (a < 0) a += Math.PI; const fromH = Math.min(a, Math.PI - a);
        if ((dir === 'h' && fromH > 0.55) || (dir === 'v' && fromH < 1.0)) continue;
        m[i] = 1;
      }
      if (area < fw * fw * 0.004) continue;
      const lines = comps(m, aw, ah, 3, N).filter((c) => Math.max(c.bw, c.bh) >= fw * 0.035 && Math.max(c.bw, c.bh) / Math.max(1, Math.min(c.bw, c.bh)) >= 2.2);
      lines.forEach((c) => c.px.forEach((p) => (wr[p] = 1)));
      // score = total line length relative to the area's width, weighted by how deep (dark) the lines are
      const rw = Math.max(...poly.map((p) => p.x)) - Math.min(...poly.map((p) => p.x));
      const score = Math.round(clamp(lines.reduce((acc, c) => acc + (Math.hypot(c.bw, c.bh) / rw) * 32 * clamp(c.px.reduce((q, p) => q + ridge[p], 0) / c.n / thr, 1, 1.8), 0)));
      const cxy = poly.reduce((acc, p) => ({ x: acc.x + p.x / poly.length, y: acc.y + p.y / poly.length }), { x: 0, y: 0 });
      regions.push({ key, label: WRINKLE_REGIONS[key][0], score, sev: SEV(score), lines: lines.length, poly, cx: cxy.x, cy: cxy.y });
    }
    regions.filter((r) => r.sev !== 'none').forEach((r) => { const p = { x: cx0 + r.cx / s, y: cy0 + r.cy / s }; findings.push({ ...p, n: r.score, type: 'wrinkles', zone: r.key, label: r.label, detail: `${r.sev} · ${r.lines} line${r.lines === 1 ? '' : 's'}` }); });
    const oil = comps(dilate(dilate(shine, aw, ah), aw, ah), aw, ah, fw * fw * 0.004, N).sort((a, b) => b.n - a.n).slice(0, 2);
    oil.forEach((c) => { const p = toImg(c); findings.push({ ...p, n: c.n, type: 'oil', zone: zoneAt(p.x, p.y), detail: 'shine' }); });
    const rs = regions.map((r) => r.score);
    const scores = {
      shine: Math.round(clamp((shineN / mN) * 1500)), redness: Math.round(clamp((redN / mN) * 1800)),
      spots: Math.round(clamp((spotPx / mN) * 2500 + spotC.length * 3)), evenness: Math.round(clamp(100 - (dev / mN) * 12)),
      wrinkles: rs.length ? Math.round(clamp(0.6 * Math.max(...rs) + 0.4 * avg(rs))) : 0,
    };
    const issues = [];
    if (acneC.length >= 2 || scores.redness >= 40) issues.push('acne');
    if (spotC.length >= 2 || scores.spots >= 35) issues.push('spots');
    if (scores.wrinkles >= 25 || regions.some((r) => r.score >= 38)) issues.push('wrinkles');
    if (scores.shine >= 40) issues.push('oil');
    if (scores.redness >= 55) issues.push('red');
    return { kind: 'skin', mesh: true, W: FW, H: FH, full, P, crop: { cx0, cy0, s, aw, ah }, ov: { red, dark: spotMaskOf(spotC, N), wr, shine }, regions, scores, findings, issues, pxMm, thumb: toThumb(full, 480) };
  }
  function spotMaskOf(cs, N) { const m = new Uint8Array(N); cs.forEach((c) => c.px.forEach((p) => (m[p] = 1))); return m; }

  function faceTexture(cur, lay) {
    const c = document.createElement('canvas'); c.width = cur.W; c.height = cur.H; const x = c.getContext('2d');
    x.drawImage(cur.full, 0, 0);
    if (lay === 'none') return c;
    const { cx0, cy0, s, aw, ah } = cur.crop, o = document.createElement('canvas'); o.width = aw; o.height = ah;
    const ox = o.getContext('2d'), im = ox.createImageData(aw, ah), d = im.data, on = (k) => lay === 'all' || lay === k;
    const paint = (m, rgb, a) => { for (let i = 0; i < m.length; i++) if (m[i]) { d[i * 4] = rgb[0]; d[i * 4 + 1] = rgb[1]; d[i * 4 + 2] = rgb[2]; d[i * 4 + 3] = a; } };
    if (on('oil')) paint(cur.ov.shine, [255, 194, 75], 120);
    if (on('acne')) paint(cur.ov.red, [255, 40, 80], 170);
    if (on('spots')) paint(cur.ov.dark, [255, 79, 216], 190);
    if (on('wrinkles')) paint(cur.ov.wr, [127, 211, 255], 235);
    ox.putImageData(im, 0, 0);
    if (on('wrinkles')) cur.regions.filter((r) => r.sev !== 'none').forEach((r) => {
      ox.strokeStyle = r.sev === 'marked' ? '#ff5c7a' : r.sev === 'moderate' ? '#ffc24b' : '#7fd3ff'; ox.lineWidth = Math.max(1.5, aw / 260); ox.setLineDash([6, 4]); pathPoly(ox, r.poly); ox.stroke();
    });
    x.drawImage(o, cx0, cy0, aw / s, ah / s);
    return c;
  }

  let TRIS = null;
  function faceTris() {
    if (TRIS) return TRIS;
    const adj = Array.from({ length: 468 }, () => new Set());
    FL.FACE_LANDMARKS_TESSELATION.forEach(({ start, end }) => { adj[start].add(end); adj[end].add(start); });
    const out = [];
    for (let a = 0; a < 468; a++) for (const b of adj[a]) if (b > a) for (const c of adj[b]) if (c > b && adj[a].has(c)) out.push([a, b, c]);
    return (TRIS = out);
  }

  const Viewer = {
    raf: 0,
    stop() {
      cancelAnimationFrame(this.raf); this.raf = 0;
      try { this.renderer?.dispose(); this.geo?.dispose(); this.tex?.dispose(); } catch {}
      this.renderer = this.geo = this.tex = null; this.el = null;
    },
    start(el, cur) {
      this.stop(); this.el = el; this.cur = cur; el.innerHTML = '';
      const T = window.THREE;
      if (!T) return this.flat(el, cur);
      try { cur.mesh ? this.buildFace(T, el, cur) : this.build(T, el, cur); } catch (e) { console.warn(e); this.stop(); this.el = el; this.flat(el, cur); }
    },
    buildFace(T, el, cur) {
      const w = el.clientWidth || 480, h = Math.min(580, Math.round(w * 1.05));
      const canvas = document.createElement('canvas'); el.appendChild(canvas);
      const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1)); renderer.setSize(w, h);
      const scene = new T.Scene(), camera = new T.PerspectiveCamera(32, w / h, 0.1, 50); camera.position.set(0, 0, 4.0);
      // close the eye openings and the mouth with small fans so the face reads as a solid surface
      const LOOPS = [[33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246], [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466], [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191]];
      const P = cur.P.slice(0, 468);
      const fans = LOOPS.map((lp, k) => { const c = lp.reduce((a, i) => ({ x: a.x + cur.P[i].x / lp.length, y: a.y + cur.P[i].y / lp.length, z: a.z + cur.P[i].z / lp.length }), { x: 0, y: 0, z: 0 }); if (k < 2) c.z -= (Math.max(...cur.P.slice(0, 468).map((p) => p.x)) - Math.min(...cur.P.slice(0, 468).map((p) => p.x))) * 0.012; P.push(c); return lp.map((a, j) => [a, lp[(j + 1) % lp.length], 468 + k]); }).flat();
      const NV = P.length, xs = P.map((p) => p.x), ys = P.map((p) => p.y), zs = P.map((p) => p.z);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2, zc = (Math.min(...zs) + Math.max(...zs)) / 2, S = (Math.max(...xs) - Math.min(...xs)) / 1.55;
      const pos = new Float32Array(NV * 3), uv = new Float32Array(NV * 2), zBase = new Float32Array(NV);
      P.forEach((p, i) => { pos[i * 3] = (p.x - cx) / S; pos[i * 3 + 1] = -(p.y - cy) / S; zBase[i] = -(p.z - zc) / S; uv[i * 2] = p.x / cur.W; uv[i * 2 + 1] = 1 - p.y / cur.H; });
      // orient every triangle the same way (towards the camera) so lighting is smooth
      const tris = [...faceTris(), ...fans].map(([a, b, c]) => { const ar = (pos[b * 3] - pos[a * 3]) * (pos[c * 3 + 1] - pos[a * 3 + 1]) - (pos[b * 3 + 1] - pos[a * 3 + 1]) * (pos[c * 3] - pos[a * 3]); return ar < 0 ? [a, c, b] : [a, b, c]; });
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('uv', new T.BufferAttribute(uv, 2)); geo.setIndex(tris.flat());
      const tex = new T.CanvasTexture(scanTexture(cur, layer));
      const mesh = new T.Mesh(geo, new T.MeshStandardMaterial({ map: tex, roughness: 0.62, metalness: 0.04, side: T.DoubleSide }));
      const edges = []; FL.FACE_LANDMARKS_TESSELATION.forEach(({ start, end }) => { if (start < 468 && end < 468) edges.push(start, end); });
      const lineGeo = new T.BufferGeometry(); lineGeo.setAttribute('position', geo.attributes.position); lineGeo.setIndex(edges);
      const wireMat = new T.LineBasicMaterial({ color: 0x3cf0ff, transparent: true, opacity: 0.5 }), wire = new T.LineSegments(lineGeo, wireMat);
      const ptsMat = new T.PointsMaterial({ color: 0xff4fd8, size: 0.018, transparent: true, opacity: 1 }), pts = new T.Points(geo, ptsMat);
      const group = new T.Group(); group.add(mesh, wire, pts); scene.add(group);
      scene.add(new T.AmbientLight(0xffffff, 0.72));
      const key = new T.DirectionalLight(0xffffff, 0.5); key.position.set(0.6, 0.8, 2); scene.add(key);
      const c1 = new T.PointLight(0x3cf0ff, 0.45, 8); c1.position.set(-2, 0.5, 1); scene.add(c1);
      const c2 = new T.PointLight(0xff4fd8, 0.35, 8); c2.position.set(2, -0.6, 1); scene.add(c2);
      const sweep = new T.Mesh(new T.PlaneGeometry(1.9, 0.01), new T.MeshBasicMaterial({ color: 0x3cf0ff, transparent: true, opacity: 0.9 })); sweep.position.z = 0.6; group.add(sweep);
      // place a marker on the mesh surface under an image point (barycentric interpolation)
      const surf = (ix, iy) => {
        for (const [a, b, c] of tris) {
          const A = P[a], B = P[b], C = P[c], den = (B.y - C.y) * (A.x - C.x) + (C.x - B.x) * (A.y - C.y); if (!den) continue;
          const u = ((B.y - C.y) * (ix - C.x) + (C.x - B.x) * (iy - C.y)) / den, v = ((C.y - A.y) * (ix - C.x) + (A.x - C.x) * (iy - C.y)) / den, t = 1 - u - v;
          if (u >= 0 && v >= 0 && t >= 0) return [a, b, c].map((k, j) => [k, [u, v, t][j]]);
        }
        let bi = 0, bd = Infinity; P.forEach((p, i) => { const d = Math.hypot(p.x - ix, p.y - iy); if (d < bd) { bd = d; bi = i; } }); return [[bi, 1]];
      };
      const markers = cur.findings.slice(0, 14).map((f, k) => {
        const col = new T.Color(FTYPE[f.type][1]);
        const m = new T.Mesh(new T.SphereGeometry(0.018, 12, 12), new T.MeshBasicMaterial({ color: col }));
        const ringM = new T.Mesh(new T.RingGeometry(0.03, 0.04, 32), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, side: T.DoubleSide }));
        m.add(ringM); group.add(m);
        const lab = document.createElement('button'); lab.className = 'mk'; lab.style.setProperty('--c', FTYPE[f.type][1]); lab.textContent = k + 1; lab.dataset.act = 'focusFind'; lab.dataset.i = k; lab.title = f.label || FTYPE[f.type][0];
        el.appendChild(lab);
        return { m, ringM, f, lab, w: surf(f.x, f.y) };
      });
      let depth = 0;
      const applyZ = () => {
        const p = geo.attributes.position;
        for (let i = 0; i < NV; i++) p.setZ(i, zBase[i] * relief * depth);
        p.needsUpdate = true; geo.computeVertexNormals();
        markers.forEach(({ m, w: wts }) => { let x = 0, y = 0, z = 0; wts.forEach(([i, t]) => { x += pos[i * 3] * t; y += pos[i * 3 + 1] * t; z += p.getZ(i) * t; }); m.position.set(x, y, z + 0.025); });
      };
      Object.assign(this, { renderer, geo, tex, applyZ, markers, scene, camera, group });
      let tx = 0, ty = 0, rx = 0, ry = 0, drag = null, last = 0, yawOff = 0;
      const t0 = performance.now();
      el.onpointermove = (e) => { const r = el.getBoundingClientRect(); if (drag) yawOff = clamp(drag.yaw + (e.clientX - drag.x) * 0.01, -1.1, 1.1); tx = ((e.clientX - r.left) / r.width - 0.5) * 1.1; ty = ((e.clientY - r.top) / r.height - 0.5) * 0.6; last = performance.now(); };
      el.onpointerdown = (e) => { if (e.target.closest('.mk')) return; drag = { x: e.clientX, yaw: yawOff }; el.setPointerCapture?.(e.pointerId); };
      el.onpointerup = el.onpointercancel = () => { drag = null; };
      el.onpointerleave = () => { last = 0; };
      el.ondblclick = () => { yawOff = 0; };
      const v3 = new T.Vector3();
      const loop = (now) => {
        this.raf = requestAnimationFrame(loop);
        if (!el.isConnected) return this.stop();
        const k = Math.min(1, (now - t0) / 1600), e = 1 - (1 - k) ** 3;   // build-up: flat photo → 3D face
        if (depth !== e) { depth = e; applyZ(); }
        sweep.visible = k < 1; sweep.position.y = 1.1 - k * 2.2;
        ptsMat.opacity = 1 - 0.85 * e; wireMat.opacity = this.wireOn ? 0.35 : 0.5 * (1 - e);
        const idle = now - last > 1800, gx = idle ? Math.sin(now / 2400) * 0.45 : clamp(tx + yawOff, -1.1, 1.1), gy = idle ? Math.sin(now / 3300) * 0.12 : ty;
        ry += (gx - ry) * 0.07; rx += (gy - rx) * 0.07; group.rotation.y = ry; group.rotation.x = rx;
        markers.forEach(({ m, ringM, lab }, i) => {
          ringM.scale.setScalar(this.focus === i ? 1.7 + 0.3 * Math.sin(now / 200) : 1 + 0.2 * Math.sin(now / 300 + i));
          ringM.lookAt(camera.position); m.getWorldPosition(v3); v3.project(camera);
          lab.style.transform = `translate(${(v3.x * 0.5 + 0.5) * w}px, ${(-v3.y * 0.5 + 0.5) * h}px)`; lab.classList.toggle('on', this.focus === i);
        });
        renderer.render(scene, camera);
      };
      this.raf = requestAnimationFrame(loop);
    },

    build(T, el, cur) {
      const w = el.clientWidth || 480, h = Math.min(560, Math.round(w * 0.95));
      const canvas = document.createElement('canvas'); el.appendChild(canvas);
      const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1)); renderer.setSize(w, h);
      const scene = new T.Scene(), camera = new T.PerspectiveCamera(35, w / h, 0.1, 50); camera.position.set(0, 0, 3.15);
      const asp = cur.W / cur.H, pw = asp >= 1 ? 1.75 : 1.75 * asp, ph = asp >= 1 ? 1.75 / asp : 1.75;
      const R = relieve(cur), geo = new T.PlaneGeometry(pw, ph, R.gw - 1, R.gh - 1);
      const tex = new T.CanvasTexture(scanTexture(cur, layer));
      const mesh = new T.Mesh(geo, new T.MeshStandardMaterial({ map: tex, roughness: 0.7, metalness: 0.05, side: T.DoubleSide }));
      const wire = new T.Mesh(geo, new T.MeshBasicMaterial({ color: 0x3cf0ff, wireframe: true, transparent: true, opacity: 0.06 }));
      const group = new T.Group(); group.add(mesh, wire); scene.add(group);
      scene.add(new T.AmbientLight(0xffffff, 0.32));
      const key = new T.DirectionalLight(0xffffff, 0.6); key.position.set(1, 1.2, 2); scene.add(key);
      const c1 = new T.PointLight(0x3cf0ff, 0.7, 8); c1.position.set(-1.8, 0.6, 1.6); scene.add(c1);
      const c2 = new T.PointLight(0xff4fd8, 0.55, 8); c2.position.set(1.8, -0.8, 1.6); scene.add(c2);
      const sweep = new T.Mesh(new T.PlaneGeometry(pw * 1.08, 0.012), new T.MeshBasicMaterial({ color: 0x3cf0ff, transparent: true, opacity: 0.9 }));
      sweep.position.z = 0.42; group.add(sweep);
      const zAt = (fx, fy) => { const gx = clamp(Math.round((fx / cur.W) * (R.gw - 1)), 0, R.gw - 1), gy = clamp(Math.round((fy / cur.H) * (R.gh - 1)), 0, R.gh - 1), g = gy * R.gw + gx; return R.baseZ[g] + relief * R.issueZ[g]; };
      const markers = cur.findings.slice(0, 12).map((f, k) => {
        const col = new T.Color(FTYPE[f.type][1]);
        const m = new T.Mesh(new T.SphereGeometry(0.02, 12, 12), new T.MeshBasicMaterial({ color: col }));
        const ringM = new T.Mesh(new T.RingGeometry(0.034, 0.044, 32), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, side: T.DoubleSide }));
        m.add(ringM); group.add(m);
        const lab = document.createElement('button'); lab.className = 'mk'; lab.style.setProperty('--c', FTYPE[f.type][1]); lab.textContent = k + 1; lab.dataset.act = 'focusFind'; lab.dataset.i = k; lab.title = `${FTYPE[f.type][0]} · ${ZONE_NAME[f.zone] || ''}`;
        el.appendChild(lab);
        return { m, ringM, f, lab };
      });
      const applyZ = () => {
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) pos.setZ(i, R.baseZ[i] + relief * R.issueZ[i]);
        pos.needsUpdate = true; geo.computeVertexNormals();
        markers.forEach(({ m, f }) => m.position.set((f.x / cur.W - 0.5) * pw, (0.5 - f.y / cur.H) * ph, zAt(f.x, f.y) + 0.03));
      };
      applyZ();
      Object.assign(this, { renderer, geo, tex, applyZ, markers, scene, camera, group });
      let tx = 0, ty = 0, rx = 0, ry = 0, drag = null, last = 0, yawOff = 0, t0 = performance.now();
      el.onpointermove = (e) => {
        const r = el.getBoundingClientRect(), u = (e.clientX - r.left) / r.width - 0.5, v = (e.clientY - r.top) / r.height - 0.5;
        if (drag) yawOff = drag.yaw + (e.clientX - drag.x) * 0.01;
        tx = u * 0.9; ty = v * 0.55; last = performance.now();
      };
      el.onpointerdown = (e) => { if (e.target.closest('.mk')) return; drag = { x: e.clientX, yaw: yawOff }; el.setPointerCapture?.(e.pointerId); };
      el.onpointerup = el.onpointercancel = () => { drag = null; };
      el.onpointerleave = () => { last = 0; };
      el.ondblclick = () => { yawOff = 0; };
      const v3 = new T.Vector3();
      const loop = (now) => {
        this.raf = requestAnimationFrame(loop);
        if (!el.isConnected) return this.stop();
        const idle = now - last > 1800;
        const gx = idle ? Math.sin(now / 2200) * 0.38 : tx, gy = idle ? Math.sin(now / 3100) * 0.12 : ty;
        ry += (gx + yawOff - ry) * 0.07; rx += (gy - rx) * 0.07;
        group.rotation.y = ry; group.rotation.x = rx;
        const st = (now - t0) / 1700;
        if (st < 1) { sweep.visible = true; sweep.position.y = ph / 2 - st * ph; } else sweep.visible = false;
        markers.forEach(({ m, ringM, lab }, k) => {
          const pulse = 1 + 0.25 * Math.sin(now / 300 + k);
          ringM.scale.setScalar(this.focus === k ? pulse * 1.6 : pulse);
          ringM.lookAt(camera.position);
          m.getWorldPosition(v3); v3.project(camera);
          lab.style.transform = `translate(${(v3.x * 0.5 + 0.5) * w}px, ${(-v3.y * 0.5 + 0.5) * h}px)`;
          lab.classList.toggle('on', this.focus === k);
        });
        renderer.render(scene, camera);
      };
      this.raf = requestAnimationFrame(loop);
    },
    setLayer() {
      if (this.tex) { this.tex.image = scanTexture(this.cur, layer); this.tex.needsUpdate = true; }
      else if (this.el) this.flat(this.el, this.cur);
    },
    setRelief() { this.applyZ?.(); },
    flat(el, cur) {
      el.innerHTML = '';
      const wrap = document.createElement('div'); wrap.className = 'flat3d';
      const cv = scanTexture(cur, layer); wrap.appendChild(cv);
      cur.findings.slice(0, 12).forEach((f, k) => {
        const lab = document.createElement('button'); lab.className = 'mk'; lab.style.setProperty('--c', FTYPE[f.type][1]); lab.textContent = k + 1; lab.dataset.act = 'focusFind'; lab.dataset.i = k;
        lab.style.left = (f.x / cur.W) * 100 + '%'; lab.style.top = (f.y / cur.H) * 100 + '%'; lab.style.position = 'absolute'; wrap.appendChild(lab);
      });
      el.appendChild(wrap);
      el.onpointermove = (e) => { const r = el.getBoundingClientRect(); wrap.style.transform = `rotateY(${((e.clientX - r.left) / r.width - 0.5) * 22}deg) rotateX(${(0.5 - (e.clientY - r.top) / r.height) * 16}deg)`; };
    },
  };

  pages.scan = () => {
    const list = db.scans.filter((s) => s.kind === (current?.kind || 'skin')).sort((a, b) => a.date.localeCompare(b.date));
    const allList = db.scans.slice().sort((a, b) => b.date.localeCompare(a.date));
    const a = db.scans.find((s) => s.id === cmp[0]), b = db.scans.find((s) => s.id === cmp[1]);
    const cur = current;
    const drop = `<label class="drop ${cur ? 'compact' : 'hero-drop'}" id="drop" for="scanFile"><input type="file" accept="image/*" id="scanFile" hidden>
      ${cur ? '<b>⇪ Scan another photo</b>' : `<div class="drop-orb"></div><b style="font-size:1.15rem">Drop a photo, or tap to choose</b><div class="small muted" style="margin-top:6px">A face selfie or a photo of your hair parting. It is scanned automatically.</div>`}</label>`;
    let body = '';
    if (cur) {
      const labels = SCAN_LABELS[cur.kind], prev = db.scans.filter((s) => s.kind === cur.kind && s.id !== cur.id).sort((x, y) => y.date.localeCompare(x.date))[0];
      const types = [...new Set(cur.findings.map((f) => f.type))];
      body = `
      <div class="split section" style="margin-top:18px">
        <div class="card viewer-card"><div class="row between"><h3>${cur.mesh ? '◐ 3D face model · 468 points' : cur.kind === 'skin' ? '◐ Face · 3D relief model' : '⌇ Scalp · 3D relief model'}</h3><span class="tiny muted">drag to rotate · double-click to reset</span></div>
          <div class="viewer" id="viewer"></div>
          <div class="row" style="margin-top:10px"><div class="chips"><button class="chip ${layer === 'all' ? 'on' : ''}" data-act="layer" data-v="all">All</button>${types.map((t) => `<button class="chip ${layer === t ? 'on' : ''}" data-act="layer" data-v="${t}" style="${layer === t ? `background:${FTYPE[t][1]};border-color:${FTYPE[t][1]}` : ''}">${t === 'wrinkles' ? 'Lines' : FTYPE[t][0] + 's'}</button>`).join('')}<button class="chip ${layer === 'none' ? 'on' : ''}" data-act="layer" data-v="none">Photo only</button></div>
            ${cur.mesh ? `<button class="chip ${Viewer.wireOn ? 'on' : ''}" data-act="wire">Mesh</button>` : ''}<label style="margin:0 0 0 auto;display:flex;align-items:center;gap:8px;min-width:160px">${cur.mesh ? 'Depth' : 'Relief'}<input type="range" id="reliefRange" min="0" max="2.5" step="0.1" value="${relief}" style="--p:${relief / 2.5 * 100}"></label></div>
          <p class="tiny muted" style="margin:8px 0 0">${cur.mesh ? 'Your face shape is reconstructed from 468 landmark points estimated by a face-mesh model, with your photo mapped onto it. Depth is an estimate from one photo, not a medical 3D scan.' : `A single photo has no real depth, so this is a relief model built from the image: affected areas are raised${cur.kind === 'hair' ? ' (visible scalp sinks)' : ''} and numbered so you can see where they are.`}</p>
        </div>
        <div class="card"><div class="row between"><h3>Scan result</h3><span class="pill ${cur.kind}">${cur.kind === 'skin' ? 'Face detected' : 'Scalp detected'}</span></div>
          <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(78px,1fr));gap:8px">${labels.map(([k, t, c]) => `<div><div class="gauge" style="--v:${cur.scores[k]};--c:${c}"><span>${cur.scores[k]}</span></div><div class="tiny" style="text-align:center">${t}${prev?.scores?.[k] != null ? `<br><span class="muted">last ${prev.scores[k]}</span>` : ''}</div></div>`).join('')}</div>
          <h3 class="mt">Found ${cur.findings.length ? cur.findings.length + ' area' + (cur.findings.length > 1 ? 's' : '') : 'nothing that stands out'}</h3>
          <div class="stack" style="gap:6px;max-height:300px;overflow:auto">${cur.findings.slice(0, 12).map((f, k) => `<button class="find" data-act="focusFind" data-i="${k}"><span class="mk static" style="--c:${FTYPE[f.type][1]}">${k + 1}</span><span><b>${f.label || FTYPE[f.type][0]}</b> <span class="muted">${f.type === 'wrinkles' ? '' : '· ' + (ZONE_NAME[f.zone] || '')}</span></span><span class="tiny muted" style="margin-left:auto;text-align:right">${f.detail || (f.type === 'thin' ? f.n + '% scalp' : f.type === 'oil' ? 'zone' : f.n > 80 ? 'larger' : 'small')}</span></button>`).join('') || '<p class="small muted">Nothing stands out in this photo.</p>'}</div>
          <div class="insight info mt"><div class="ic">✓</div><div><b>Saved and filled in</b><p>${cur.fromHistory ? 'Opened from your history.' : `Added to your history, and today's check-in was filled in${cur.kind === 'skin' ? ` (${cur.findings.filter((f) => f.type === 'acne').length} spots, redness, oiliness)` : ' (flakes)'}. Nothing to type.`}</p></div></div>
          ${cur.fromHistory ? '' : `<button class="btn sm ghost mt" data-act="delScan" data-id="${cur.id}">Delete this scan</button>`}
        </div>
      </div>
      ${cur.regions ? `<div class="card section"><h3>Lines & wrinkles by area</h3><div class="wr-grid">${cur.regions.map((r) => `<div class="wr ${r.sev}"><div class="row between" style="flex-wrap:nowrap"><b class="small">${r.label}</b><span class="pill ${r.sev === 'marked' ? 'bad' : r.sev === 'moderate' ? 'warn' : r.sev === 'mild' ? 'skin' : 'good'}">${r.sev === 'none' ? 'smooth' : r.sev}</span></div><div class="bar" style="margin-top:8px"><i style="width:${r.score}%;--c:${r.sev === 'marked' ? 'var(--bad)' : r.sev === 'moderate' ? 'var(--warn)' : '#7fd3ff'}"></i></div><div class="tiny muted" style="margin-top:4px">${r.lines} line${r.lines === 1 ? '' : 's'} detected · score ${r.score}</div></div>`).join('')}</div>
        <p class="tiny muted" style="margin:10px 0 0">Expression lines show more when you smile or frown, and side lighting exaggerates them. For tracking, use a neutral face and even, front-facing light each time. Spot sizes in mm are estimated from the average distance between pupils (about 63 mm).</p></div>` : ''}

      <div class="section"><span class="eyebrow">How to fix it</span><h2 style="margin-bottom:14px">${cur.issues.length ? 'Your plan' : 'Keep doing what you are doing'}</h2>
        ${cur.issues.length ? `<div class="grid g2">${cur.issues.map((k) => { const f = FIXES[k]; return `<div class="card fix" style="--c:${f.color}">
          <h3 style="color:${f.color}">● ${f.title}</h3><p class="small">${f.why}</p>
          <div class="grid" style="grid-template-columns:repeat(2,minmax(0,1fr));gap:12px">
            ${f.am.length ? `<div><div class="tiny muted" style="letter-spacing:.15em">☀ MORNING</div><ol class="small steps">${f.am.map((s) => `<li>${s}</li>`).join('')}</ol></div>` : ''}
            <div><div class="tiny muted" style="letter-spacing:.15em">☾ NIGHT</div><ol class="small steps">${f.pm.map((s) => `<li>${s}</li>`).join('')}</ol></div></div>
          <ul class="clean small">${f.habits.map((h) => `<li>${h}</li>`).join('')}</ul>
          <p class="small" style="margin:10px 0 6px"><b>Timeline:</b> ${f.timeline}</p>
          <p class="small" style="margin:0 0 6px;color:var(--bad)"><b>See a dermatologist if:</b> ${f.derm}</p>
          <p class="tiny muted" style="margin:0">Evidence: ${f.evidence}</p></div>`; }).join('')}</div>
          <div class="row mt"><button class="btn primary" data-act="addPlan">Add these steps to my routine</button><span class="small muted">Patch test new products for 2–3 days, and start one new active at a time.</span></div>`
        : '<div class="card"><p style="margin:0">No clear problem areas in this photo. Keep up daily sunscreen and a gentle routine, and rescan in a week in the same light.</p></div>'}
        <p class="tiny muted mt">These are general, first-line options from dermatology guidelines, not a diagnosis or prescription. Retinoids such as adapalene are not for use in pregnancy.</p>
      </div>`;
    } else {
      body = `<div class="grid g3 section">
        <div class="card"><h3>1 · Upload</h3><p class="small muted" style="margin:0">A front-facing selfie in daylight, or your hair parting from above.</p></div>
        <div class="card"><h3>2 · Auto scan</h3><p class="small muted" style="margin:0">It works out face or scalp and finds spots, marks, oily zones, thinning and flakes.</p></div>
        <div class="card"><h3>3 · 3D model & plan</h3><p class="small muted" style="margin:0">Turn the 3D model to see each area, then follow the fix plan. Your check-in fills itself.</p></div>
      </div>`;
    }
    return `${demoBanner()}<div class="page-head"><span class="eyebrow">Photo scan</span><h1>Upload. Scan. <span class="grad-text">See it in 3D.</span></h1>
      <p>The photo is analysed on this device and never uploaded anywhere.</p></div>
      ${drop}
      <div id="scanStage" class="hidden"></div>
      ${body}
      ${allList.length ? `<div class="section"><div class="row between"><h2 style="margin:0">History</h2><span class="small muted">Tap a scan to open it in 3D · ✓ two to compare</span></div>
        ${list.length > 1 ? `<div class="card mt">${lineChart('scanChart', list.map((s) => s.date), SCAN_LABELS[current?.kind || 'skin'].map(([k, t, c]) => ({ label: t, color: c, vals: list.map((s) => s.scores?.[k] ?? null), max: 100 })), { h: 200 })}</div>` : ''}
        ${a && b ? `<div class="card mt"><div class="row between"><h3>Compare ${fmtShort(a.date)} → ${fmtShort(b.date)}</h3><button class="btn sm ghost" data-act="cmpClear">Close</button></div>
          <div class="ba mt" style="--pos:50%"><div class="layer"><img src="${a.img}" alt="Earlier scan"></div><div class="layer after"><img src="${b.img}" alt="Later scan"></div><span class="tag" style="left:10px">${fmtShort(a.date)}</span><span class="tag" style="right:10px">${fmtShort(b.date)}</span><div class="handle"></div>
          <input type="range" min="0" max="100" value="50" id="baRange" aria-label="Drag to compare"></div></div>` : ''}
        <div class="thumbs mt">${allList.map((s) => `<div><button class="thumb ${current?.id === s.id ? 'sel' : ''}" data-act="openScan" data-id="${s.id}" style="width:100%"><img src="${s.img}" alt="${s.kind} scan ${s.date}"><div><span class="pill ${s.kind}">${s.kind === 'skin' ? 'face' : 'scalp'}</span> <b>${fmtShort(s.date)}</b></div></button>
          <button class="btn sm ghost ${cmp.includes(s.id) ? 'on-cmp' : ''}" style="width:100%;margin-top:4px" data-act="pick" data-id="${s.id}">${cmp.includes(s.id) ? '✓ comparing' : 'Compare'}</button></div>`).join('')}</div></div>` : ''}`;
  };

  async function runScan(file, opts = {}) {
    if (busy) return;
    if (!file || !(opts.src || file.type?.startsWith('image/'))) return toast('Please choose an image file');
    busy = true;
    let img; try { img = await loadImage(file, opts.src); } catch { busy = false; return toast('That image could not be opened'); }
    const sized = (max) => { const c = document.createElement('canvas'), k = Math.min(1, max / Math.max(img.width, img.height)); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0, c.width, c.height); return c; };
    const full = sized(1100), cv = sized(440);
    const stage = $('#scanStage'), wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const names = [landmarker || lmFailed ? 'Detecting face landmarks' : 'Loading face model (first scan only)', 'Mapping skin tone and texture', 'Finding spots, marks and lines', 'Building 3D face model', 'Writing your fix plan'];
    const step = async (i, work) => { const el = $$('#steps .stp')[i]; el?.classList.add('run'); const r = await work(); await wait(opts.quiet ? 0 : 320); el?.classList.replace('run', 'done'); return r; };
    if (stage && !opts.quiet) {
      stage.className = 'card scanning section';
      stage.innerHTML = `<div class="scan-prev"><img src="${cv.toDataURL('image/jpeg', 0.7)}" alt="Your photo"><div class="beam"></div></div><div class="stack" id="steps">${names.map((s) => `<div class="stp">${s}</div>`).join('')}</div>`;
    }
    const want = opts.kind || scanKind;
    const lmk = want === 'hair' ? null : await step(0, () => loadLandmarker());
    let res = null;
    if (lmk) {
      const det = await step(1, async () => { await wait(30); try { return lmk.detect(full); } catch { return null; } });
      const lm = det?.faceLandmarks?.[0];
      if (lm) res = await step(2, async () => { await wait(30); try { return analyzeFace(full, lm); } catch (e) { console.warn(e); return null; } });
    }
    if (!res) res = analyzePhoto(cv, want);
    if (!opts.quiet) { await step(3, () => wait(250)); await step(4, () => wait(150)); }
    busy = false;
    if (!res) {
      if (stage) { stage.className = 'card section'; stage.innerHTML = `<h3>Couldn't read this photo</h3><p class="muted" style="margin:0">Try a closer, sharper photo in daylight: a front-facing selfie, or your hair parting from above.</p>`; }
      return;
    }
    if (opts.history) { res.id = opts.history.id; res.fromHistory = true; }
    else {
      res.id = uid();
      db.scans.push({ id: res.id, date: today(), kind: res.kind, img: res.thumb, scores: res.scores, issues: res.issues, count: res.findings.length });
      while (JSON.stringify(db).length > 4.2e6 && db.scans.length > 8) db.scans.shift();   // keep localStorage under its ~5 MB limit
      applyScanToLog(res);
      if (save()) toast(`Scan saved · ${res.findings.length} area${res.findings.length === 1 ? '' : 's'} found`);
    }
    current = res; layer = 'all'; Viewer.focus = null;
    if (route !== '/scan') go('#/scan'); else render();
  }
  function addPlanToRoutine() {
    if (!current) return;
    let added = 0;
    current.issues.forEach((k) => ['am', 'pm'].forEach((w) => FIXES[k][w].forEach((s) => {
      const short = s.split(',')[0].split(' (')[0];
      if (db.routine[w].some((x) => x.name.toLowerCase() === short.toLowerCase())) return;
      db.routine[w].push({ id: uid(), name: short, kind: k === 'thin' || k === 'flakes' ? 'hair' : 'skin' }); added++;
    })));
    save(); toast(added ? `${added} step${added > 1 ? 's' : ''} added to your routine` : 'Your routine already has these steps');
  }

  /* ---------- trends ---------- */
  let trendRange = 30, trendSel = ['skinScore', 'hairScore'];
  pages.trends = () => {
    const dates = lastDays(trendRange), prevEnd = addDays(today(), -trendRange);
    const cors = correlations(Math.max(trendRange, 30)).filter((c) => Math.abs(c.effect) >= 0.2).slice(0, 6);
    const logged = dates.filter((d) => db.logs[d]).length;
    return `${demoBanner()}<div class="page-head"><span class="eyebrow">Trends</span><h1>What is <span class="grad-text">changing?</span></h1><p>Move your pointer (or finger) across the chart to read any day. Pick up to four lines.</p></div>
    <div class="row between"><div class="chips">${[7, 30, 90].map((n) => `<button class="chip ${trendRange === n ? 'on' : ''}" data-act="range" data-v="${n}">${n} days</button>`).join('')}</div><span class="small muted">${logged} of ${trendRange} days logged</span></div>
    <div class="chips mt">${Object.entries(METRICS).map(([k, m]) => `<button class="chip ${trendSel.includes(k) ? 'on' : ''}" style="${trendSel.includes(k) ? `background:${m.color};border-color:${m.color}` : ''}" data-act="metric" data-v="${k}" aria-pressed="${trendSel.includes(k)}">${m.label}</button>`).join('')}</div>
    <div class="card mt">${trendSel.length ? lineChart('trend', dates, trendSel.map((k) => ({ label: METRICS[k].label, color: METRICS[k].color, vals: series(k, dates), max: METRICS[k].max }))) : '<p class="muted">Pick a metric above.</p>'}
      ${trendSel.length > 1 ? '<p class="tiny muted" style="margin:8px 0 0">With several lines, each is scaled to its own range so their shapes can be compared.</p>' : ''}</div>

    <div class="grid g2 section">
      <div class="card"><h3>Last ${trendRange} days vs the ${trendRange} before</h3><div>
        ${['skinScore', 'hairScore', 'fall', 'breakouts', 'red', 'flakes', 'sleep', 'stress', 'routine'].map((k) => {
          const cur = avgOver(k, trendRange), prev = avgOver(k, trendRange, prevEnd), m = METRICS[k];
          return `<div class="row between" style="padding:9px 0;border-bottom:1px solid var(--line);flex-wrap:nowrap"><span class="small"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${m.color};margin-right:8px"></span>${m.label}</span><span class="row" style="gap:12px;flex-wrap:nowrap"><b class="num">${cur == null ? '—' : round(cur, 1)}</b>${delta(cur, prev, m.lowerBetter, '')}</span></div>`;
        }).join('')}</div></div>
      <div class="card"><h3>Patterns found</h3>
        ${cors.length ? `<div class="stack">${cors.map((c) => {
          const mx = Math.max(c.with, c.without, 0.1), worse = c.effect > 0;
          return `<div class="insight ${worse ? 'warn' : 'good'}"><div class="ic">${worse ? '▲' : '▼'}</div><div style="flex:1;min-width:0"><b>${c.f.label} → ${worse ? 'more' : 'less'} ${c.name}</b>
            <div class="cmp-bars"><div class="row"><span>With</span><div class="bar"><i style="width:${(c.with / mx) * 100}%;--c:${worse ? 'var(--warn)' : 'var(--good)'}"></i></div><span class="num">${round(c.with, 1)}</span></div>
            <div class="row"><span>Without</span><div class="bar"><i style="width:${(c.without / mx) * 100}%;--c:rgba(255,255,255,.35)"></i></div><span class="num">${round(c.without, 1)}</span></div></div>
            <p class="tiny">${c.nWith} vs ${c.nWithout} days</p></div></div>`;
        }).join('')}</div><p class="tiny muted mt" style="margin-bottom:0">These are correlations in your own logs, not proof of cause. They get more reliable the more days you log.</p>` : '<p class="muted small">Log at least a couple of weeks with some variety (good and bad sleep, stress, food) and patterns appear here.</p>'}</div>
    </div>
    <div class="card section tilt"><div class="row between"><h3>Calendar · ${heatKey === 'skinScore' ? 'skin' : 'hair'}</h3><div class="chips"><button class="chip ${heatKey === 'skinScore' ? 'on' : ''}" data-act="heatKey" data-v="skinScore">Skin</button><button class="chip hair ${heatKey === 'hairScore' ? 'on' : ''}" data-act="heatKey" data-v="hairScore">Hair</button></div></div>${heatmap(heatKey, 13)}</div>`;
  };

  /* ---------- routine ---------- */
  const CONFLICTS = [
    [/retin|adapalene|tretinoin/i, /glycolic|lactic|\baha\b|salicylic|\bbha\b|peel/i, 'A retinoid and an exfoliating acid in the same routine can irritate. Alternate nights.'],
    [/retin|adapalene/i, /benzoyl|\bbpo\b/i, 'Benzoyl peroxide can break down retinol. Move BPO to the morning.'],
    [/vitamin c|ascorbic/i, /benzoyl|\bbpo\b/i, 'Benzoyl peroxide oxidises vitamin C. Use them at different times of day.'],
  ];
  function routineWarnings() {
    const out = [];
    for (const w of ['am', 'pm']) {
      const names = db.routine[w].map((s) => s.name).join(' | ');
      CONFLICTS.forEach(([a, b, msg]) => { if (a.test(names) && b.test(names)) out.push(`${w === 'am' ? 'Morning' : 'Night'}: ${msg}`); });
    }
    const amSkin = db.routine.am.filter((s) => s.kind === 'skin');
    if (!/sunscreen|spf/i.test(amSkin.map((s) => s.name).join(' '))) out.push('No sunscreen in your morning routine. It protects every other step you do.');
    else if (!/sunscreen|spf/i.test(amSkin.at(-1)?.name || '')) out.push('Sunscreen should be the last morning skin step.');
    return out;
  }
  pages.routine = () => {
    const d30 = lastDays(30), warns = routineWarnings();
    const stepRate = (w, id) => { const ls = d30.map((d) => db.logs[d]).filter(Boolean); return ls.length ? ls.filter((l) => l.done[w].includes(id)).length / ls.length : 0; };
    let rs = 0;
    for (let d = db.logs[today()] ? today() : addDays(today(), -1); rs < 400; d = addDays(d, -1)) { const a = adherence(db.logs[d]); if (a == null || a < 0.75) break; rs++; }
    const ls60 = lastDays(60).map((d) => db.logs[d]).filter(Boolean);
    const dn = ls60.filter((l) => (doneShare(l, 'pm') ?? 0) >= 0.8), sk = ls60.filter((l) => (doneShare(l, 'pm') ?? 0) < 0.5);
    const sa = avg(dn.map(skinScore)), sb = avg(sk.map(skinScore));
    return `${demoBanner()}<div class="page-head"><span class="eyebrow">Routine</span><h1>Your <span class="grad-text">routine</span></h1><p>Tick steps as you do them. The monitor tracks how consistent you are and whether it shows in your scores.</p></div>
    <div class="grid g3">
      <div class="card tilt metric"><h3>Routine streak</h3><div class="v num">${rs}<small> days at 75%+</small></div></div>
      <div class="card tilt metric"><h3>This week</h3><div class="v num">${Math.round((avg(lastDays(7).map((d) => adherence(db.logs[d]))) || 0) * 100)}<small>%</small></div></div>
      <div class="card tilt metric"><h3>Skin score: night routine done vs skipped</h3>${sa == null || sb == null || sk.length < 3 ? '<p class="small muted" style="margin:0">Needs a few skipped and completed nights to compare.</p>' : `<div class="v num">${Math.round(sa)} <small>vs</small> ${Math.round(sb)}</div><span class="delta ${sa > sb ? 'up' : 'down'}">${sa > sb ? '▲' : '▼'} ${Math.abs(Math.round(sa - sb))} points on nights you did it</span>`}</div>
    </div>
    <div class="split section">
      <div class="card"><div class="row between"><h3>Today</h3><a class="small" href="#/log">Full check-in →</a></div>${routineChecklist(today())}</div>
      <div class="card"><h3>Edit steps</h3>
        ${['am', 'pm'].map((w) => `<div class="tiny muted" style="margin:12px 0 6px;letter-spacing:.15em">${w === 'am' ? '☀ MORNING' : '☾ NIGHT'}</div>
          ${db.routine[w].map((s, i) => `<div class="step-edit"><span class="small">${esc(s.name)} ${s.kind === 'hair' ? '<span class="pill hair">hair</span>' : ''}<br><span class="tiny muted">done on ${Math.round(stepRate(w, s.id) * 100)}% of logged days</span></span>
            <button data-act="mv" data-w="${w}" data-i="${i}" data-d="-1" aria-label="Move up">↑</button><button data-act="mv" data-w="${w}" data-i="${i}" data-d="1" aria-label="Move down">↓</button><button data-act="rmStep" data-w="${w}" data-id="${s.id}" aria-label="Remove">✕</button></div>`).join('')}`).join('')}
        <form class="stack mt" data-form="addStep">
          <input type="text" id="stepName" name="name" placeholder="e.g. Azelaic acid 10%" required>
          <div class="row"><select id="stepWhen" name="when" style="flex:1"><option value="am">Morning</option><option value="pm">Night</option></select><select id="stepKind" name="kind" style="flex:1"><option value="skin">Skin</option><option value="hair">Hair</option></select><button class="btn sm primary">Add step</button></div>
        </form>
        ${warns.length ? `<div class="stack mt">${warns.map((w) => `<div class="insight warn"><div class="ic">⚠</div><div><p style="color:var(--text);margin:0">${esc(w)}</p></div></div>`).join('')}</div>` : '<div class="insight good mt"><div class="ic">✓</div><div><b>No conflicts found</b><p>Your steps look safe to combine.</p></div></div>'}
      </div>
    </div>`;
  };

  /* ---------- fuel: nutrition & hydration ---------- */
  // Per serving. Carbs exclude fibre (available carbs). Approximate values from IFCT 2017 (NIN) and USDA FoodData Central.
  const FOODS = [
    ['roti', 'Whole-wheat roti', '1 medium (30 g atta)', 100, 19, 3.6, 0.5, 3.4, 'Grains'],
    ['millet', 'Jowar / bajra / ragi roti', '1 (30 g flour)', 100, 20, 3.2, 1, 3, 'Grains'],
    ['rice', 'White rice', '1 cup cooked (150 g)', 195, 41, 4, 0.4, 0.6, 'Grains'],
    ['brown', 'Brown rice', '1 cup cooked (150 g)', 165, 32, 3.8, 1.3, 2.7, 'Grains'],
    ['quinoa', 'Quinoa', '1 cup cooked (185 g)', 222, 34, 8, 3.6, 5, 'Grains'],
    ['idli', 'Idli', '2 pieces', 116, 24, 4, 0.4, 1, 'Grains'],
    ['dosa', 'Plain dosa', '1 medium', 150, 25, 3.5, 4, 1, 'Grains'],
    ['poha', 'Poha', '1 plate (180 g)', 250, 42, 4.5, 7, 2, 'Grains'],
    ['dal', 'Dal (without tadka)', '1 katori (30 g dry)', 105, 15, 7, 0.5, 3, 'Pulses'],
    ['rajma', 'Rajma / chole', '1 katori (150 g cooked)', 200, 25, 12, 2.5, 10, 'Pulses'],
    ['sprouts', 'Moong sprouts', '1 cup (100 g)', 30, 4, 3, 0.2, 1.8, 'Pulses'],
    ['soya', 'Soya chunks', '30 g dry', 104, 6, 15.5, 0.2, 4, 'Pulses'],
    ['paneer', 'Paneer', '100 g', 265, 3.5, 18, 20, 0, 'Protein'],
    ['tofu', 'Tofu (firm)', '100 g', 144, 2, 17, 8.7, 2.3, 'Protein'],
    ['eggs', 'Eggs, boiled', '2 large', 155, 1, 12.6, 10.6, 0, 'Protein'],
    ['chicken', 'Chicken breast', '100 g cooked', 165, 0, 31, 3.6, 0, 'Protein'],
    ['fish', 'Fish', '100 g cooked', 140, 0, 22, 5, 0, 'Protein'],
    ['curd', 'Curd (dahi)', '1 cup (200 g)', 122, 9.4, 7, 6.6, 0, 'Dairy'],
    ['greek', 'Hung curd / Greek yogurt', '150 g', 110, 6, 14, 4, 0, 'Dairy'],
    ['chaas', 'Buttermilk (chaas)', '1 glass', 40, 3, 2, 1.5, 0, 'Dairy'],
    ['sabzi', 'Mixed veg sabzi', '1 katori, 1 tsp oil', 90, 9, 3, 5, 4, 'Vegetables'],
    ['greens', 'Palak / leafy sabzi', '1 katori, 1 tsp oil', 80, 5, 3.5, 5, 3, 'Vegetables'],
    ['salad', 'Salad (cucumber, tomato, onion)', '1 bowl (150 g)', 35, 6, 1.5, 0.2, 2, 'Vegetables'],
    ['guava', 'Guava', '1 medium (100 g)', 68, 9, 2.6, 1, 5.4, 'Fruit & snacks'],
    ['apple', 'Apple', '1 medium', 95, 21, 0.5, 0.3, 4.4, 'Fruit & snacks'],
    ['banana', 'Banana', '1 medium', 105, 24, 1.3, 0.4, 3, 'Fruit & snacks'],
    ['chana', 'Roasted chana', '30 g', 110, 13, 6, 1.8, 5, 'Fruit & snacks'],
    ['almonds', 'Almonds', '10 (12 g)', 70, 1, 2.5, 6, 1.5, 'Fruit & snacks'],
  ].map(([id, name, serving, kcal, c, p, f, fib, group]) => ({ id, name, serving, kcal, c, p, f, fib, group }));
  const FOOD = Object.fromEntries(FOODS.map((f) => [f.id, f]));
  const PLATES = {
    low: ['Lower-carb lunch', { paneer: 1, sabzi: 1, salad: 1, millet: 1, chaas: 1 }],
    thali: ['Dal-roti thali', { roti: 2, dal: 1, sabzi: 1, curd: 1, salad: 1 }],
    rice: ['Rice-heavy lunch', { rice: 2, dal: 1, sabzi: 1 }],
    nonveg: ['Chicken & greens', { chicken: 1, greens: 1, salad: 1, roti: 1 }],
    tiffin: ['Quick desk tiffin', { greek: 1, chana: 1, guava: 1, sprouts: 1 }],
  };
  const NUTRIENTS = [
    ['Protein', (t) => `${Math.round(t.protein)} g/day (${t.pk} g per kg)`, 'Hair is made mostly of keratin, a protein. Very low intake and crash diets can trigger shedding 2–3 months later.', 'Dal, rajma, chana, paneer, curd, eggs, fish, chicken, soya'],
    ['Iron', (t, p) => (p.sex === 'male' ? '19 mg' : '29 mg'), 'Low iron stores (ferritin) are linked with hair shedding, especially in women. Plant iron absorbs better with vitamin C; keep tea and coffee an hour away from meals.', 'Rajma, chana, dal, leafy greens, eggs, fish, meat, with amla, guava or lemon'],
    ['Zinc', (t, p) => (p.sex === 'male' ? '17 mg' : '13.2 mg'), 'Needed for hair growth and skin repair. Low zinc is linked with hair loss and slow wound healing.', 'Pumpkin seeds, chickpeas, cashews, dairy, eggs, meat'],
    ['Vitamin D', () => '600 IU (15 µg)', 'Deficiency is very common in India and is associated with hair loss. Get tested before taking high-dose supplements.', 'Midday sun on arms and legs, fatty fish, egg yolk, fortified milk'],
    ['Vitamin B12', () => '2.5 µg', 'Deficiency causes fatigue and can affect hair. Vegetarians and vegans are at higher risk.', 'Milk, curd, paneer, eggs, fish, meat; a supplement if vegan'],
    ['Vitamin C', (t, p) => (p.sex === 'male' ? '80 mg' : '65 mg'), 'Needed to build collagen, and it helps you absorb plant iron.', 'Amla, guava, oranges, capsicum, tomato, lemon'],
    ['Omega-3', () => '≈250 mg EPA + DHA (EFSA)', 'May help dryness and inflammation. Evidence for skin is moderate.', 'Fish (mackerel, salmon, rohu), flaxseed, walnuts, chia'],
    ['Biotin', () => '40 µg', 'Deficiency is rare. Extra biotin does not grow hair if you are not deficient, and high doses can distort thyroid and other blood tests.', 'Eggs, nuts, seeds, pulses'],
  ];
  const plateTotals = (items) => { const t = { kcal: 0, c: 0, p: 0, f: 0, fib: 0 }; Object.entries(items).forEach(([id, q]) => { const f = FOOD[id]; if (f && q) for (const k in t) t[k] += f[k] * q; }); return t; };
  let plateMode = 'low';
  const tbar = (label, v, target, unit, color, invert) => {
    const pc = target ? v / target : 0, over = invert ? pc > 1.15 : pc < 0.8;
    return `<div class="meter-row"><div class="row between small" style="flex-wrap:nowrap"><span>${label}</span><span class="num">${round(v, 0)} / ${Math.round(target)} ${unit}</span></div><div class="bar"><i style="width:${clamp(pc * 100, 0, 100)}%;--c:${over ? 'var(--warn)' : color}"></i></div></div>`;
  };

  pages.fuel = () => {
    const p = db.profile, t = targets(), tl = db.logs[today()], water = tl?.life.water ?? 0;
    const items = db.plate.items, tot = plateTotals(items);
    const lunchC = plateMode === 'low' ? 30 : t.carbs * 0.3, lunchP = Math.max(25, t.protein * 0.3), lunchFib = Math.max(8, t.fiber * 0.3), lunchK = t.kcal * 0.3;
    const ratio = tot.fib ? tot.c / tot.fib : tot.c ? Infinity : 0;
    const notes = [];
    if (!tot.kcal) notes.push(['info', 'Add foods on the left to build a lunch.']);
    else {
      notes.push(tot.c > lunchC * 1.15 ? ['warn', `Carbs ${Math.round(tot.c)} g, above your ${Math.round(lunchC)} g target. Swap a grain serving for dal, paneer, eggs or extra veg.`] : ['good', `Carbs ${Math.round(tot.c)} g, within your ${Math.round(lunchC)} g ${plateMode === 'low' ? 'lower-carb' : 'balanced'} target.`]);
      notes.push(tot.p < lunchP * 0.8 ? ['warn', `Protein ${Math.round(tot.p)} g. Aim for about ${Math.round(lunchP)} g: add curd, paneer, eggs, dal or soya.`] : ['good', `Protein ${Math.round(tot.p)} g. Good for hair and keeps you full.`]);
      notes.push(ratio > 10 ? ['warn', `Carb-to-fibre ratio ${ratio === Infinity ? 'very high' : ratio.toFixed(1) + ':1'}. Under 10:1 means mostly whole, slow carbs; add salad, veg, dal or a whole grain.`] : ['good', `Carb-to-fibre ratio ${ratio.toFixed(1)}:1, under 10:1, so mostly slow carbs.`]);
    }
    const d30 = lastDays(30).map((d) => db.logs[d]).filter(Boolean), skip = d30.filter((l) => !meals(l).l), eat = d30.filter((l) => meals(l).l);
    const cmpRow = (label, k, unit, dp = 0) => { const a = avg(skip.map((l) => METRICS[k].get(l))), b = avg(eat.map((l) => METRICS[k].get(l))); return a == null || b == null ? '' : `<tr><td>${label}</td><td class="num">${round(a, dp)}${unit}</td><td class="num">${round(b, dp)}${unit}</td></tr>`; };
    const groups = [...new Set(FOODS.map((f) => f.group))];
    const C = 2 * Math.PI * 52;
    return `${demoBanner()}<div class="page-head"><span class="eyebrow">Fuel</span><h1>Food & water for <span class="grad-text">skin and hair</span></h1>
      <p>Targets are calculated from your body and activity using published reference values (sources at the bottom). Update your details to personalise them.</p></div>
    <div class="split">
      <div class="card"><h3>Your daily targets</h3>
        <div class="tiles">
          <div class="tile"><div class="k">Energy</div><div class="v num">${Math.round(t.kcal)}</div><div class="tiny muted">kcal · BMR ${Math.round(t.bmr)}${p.goal === 'lose' ? ' · gentle 15% deficit' : ''}</div></div>
          <div class="tile"><div class="k">Protein</div><div class="v num" style="color:#ffd27a">${Math.round(t.protein)} g</div><div class="tiny muted">${t.pk} g per kg body weight</div></div>
          <div class="tile"><div class="k">Carbs</div><div class="v num">${Math.round(t.carbs)} g</div><div class="tiny muted">${Math.round((t.carbs * 4 / t.kcal) * 100)}% of energy (healthy range 45–65%). Keep rice, roti and other cereals near 45%; get the rest from pulses, veg, fruit and dairy</div></div>
          <div class="tile"><div class="k">Fat</div><div class="v num">${Math.round(t.fat)} g</div><div class="tiny muted">30% of energy (healthy range 20–35%)</div></div>
          <div class="tile"><div class="k">Fibre</div><div class="v num" style="color:var(--good)">${Math.round(t.fiber)} g</div><div class="tiny muted">14 g per 1000 kcal</div></div>
          <div class="tile"><div class="k">Water</div><div class="v num" style="color:#6bb8ff">${round(t.water, 1)} L</div><div class="tiny muted">${t.glasses} glasses from drinks today</div></div>
        </div>
        <p class="tiny muted" style="margin:12px 0 0">These are population reference values, not a prescription. If you have diabetes, PCOS, kidney disease or are pregnant, ask a doctor or dietitian for your numbers.</p>
      </div>
      <form class="card" data-form="body"><h3>Personalise (optional)</h3><p class="tiny muted" style="margin-top:-4px">Sensible defaults are used until you change these.</p>
        <div class="grid" style="grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">
          <div><label for="bSex">Sex</label><select id="bSex" name="sex"><option value="female" ${p.sex !== 'male' ? 'selected' : ''}>Female</option><option value="male" ${p.sex === 'male' ? 'selected' : ''}>Male</option></select></div>
          <div><label for="bAge">Age</label><input type="number" id="bAge" name="age" min="14" max="90" value="${p.age}" required></div>
          <div><label for="bW">Weight (kg)</label><input type="number" id="bW" name="weight" min="30" max="200" step="0.5" value="${p.weight}" required></div>
          <div><label for="bH">Height (cm)</label><input type="number" id="bH" name="height" min="120" max="220" value="${p.height}" required></div>
          <div><label for="bAct">Activity</label><select id="bAct" name="activity">${[['sedentary', 'Desk job, little exercise'], ['light', 'Light (1–3 workouts/week)'], ['moderate', 'Moderate (3–5/week)'], ['very', 'Very active (6–7/week)']].map(([v, l]) => `<option value="${v}" ${p.activity === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div><label for="bGoal">Goal</label><select id="bGoal" name="goal"><option value="maintain" ${p.goal !== 'lose' ? 'selected' : ''}>Maintain weight</option><option value="lose" ${p.goal === 'lose' ? 'selected' : ''}>Lose slowly</option></select></div>
        </div>
        <button class="btn primary sm mt">Update targets</button>
      </form>
    </div>

    <div class="grid g2 section">
      <div class="card tilt"><h3>💧 Hydration today</h3>
        <div class="row" style="gap:22px;flex-wrap:nowrap">
          <div class="rings" style="width:150px;height:150px;flex:none;margin:0"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" fill="none" stroke="rgba(107,184,255,0.14)" stroke-width="10"/><circle class="ring-arc" cx="60" cy="60" r="52" fill="none" stroke="#6bb8ff" stroke-width="10" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}" data-off="${C * (1 - clamp(water / t.glasses, 0, 1))}" style="filter:drop-shadow(0 0 6px #6bb8ff)"/></svg><div class="center"><div><div class="big num" style="font-family:var(--font-display);font-size:1.8rem">${water}<span class="small muted">/${t.glasses}</span></div><div class="tiny muted">glasses</div></div></div></div>
          <div style="min-width:0"><div class="row"><button class="btn sm" data-act="glass" data-v="-1" aria-label="Remove a glass">−</button><button class="btn primary sm" data-act="glass" data-v="1">+ 1 glass (250 ml)</button></div>
            <p class="small" style="margin:10px 0 6px">${round(water * 0.25, 2)} of ${round(t.water, 1)} L</p>
            <div class="row">${['workout', 'hot'].map((k) => `<button class="toggle ${tl?.life[k] ? 'on' : ''}" data-act="flip" data-path="life.${k}" data-today="1">${tl?.life[k] ? '✓' : '○'} ${k === 'hot' ? 'Hot / sweaty day +0.5 L' : 'Workout today +0.5 L'}</button>`).join('')}</div></div>
        </div>
        <ul class="clean small mt">
          <li>EFSA sets adequate total water at <b>2.0 L/day for women and 2.5 L/day for men</b>. About 20% comes from food, so drinks need to supply roughly ${p.sex === 'male' ? '2.0' : '1.6'} L.</li>
          <li>Sweat losses during exercise range from about 0.5 to 2 L per hour, and Indian summers add more. Drink extra on those days.</li>
          <li>Pale-yellow urine is a simple, reliable check. Tea, coffee, milk, buttermilk and coconut water all count.</li>
          <li>Drinking more than you need does not hydrate your skin further; evidence for that is weak. Moisturiser does that job.</li>
        </ul>
      </div>

      <div class="card"><h3>◍ Thinking of skipping lunch to avoid carbs?</h3>
        <ul class="clean small">
          <li><b>Total carbs and carb quality matter more than one meal.</b> ICMR-NIN's 2024 guidelines suggest keeping cereals to about 45% of calories and filling the rest with pulses, vegetables, fruit, nuts and dairy.</li>
          <li><b>Skipping is not harmful by itself.</b> In a 12-month trial, time-restricted eating gave similar weight loss to ordinary calorie restriction (Liu et al., NEJM 2022).</li>
          <li><b>The risk for your hair is under-eating.</b> If skipping lunch means you miss your protein, iron or calories, shedding can follow 2–3 months later.</li>
          <li><b>For your skin, choose slow carbs rather than zero carbs.</b> A low-glycaemic-load diet reduced acne lesions in a 12-week trial (Smith et al., AJCN 2007).</li>
        </ul>
        <div class="insight good"><div class="ic">✓</div><div><b>Better than skipping: a lower-carb lunch</b><p>About ${Math.round(lunchP)} g protein, half a plate of vegetables, and one small serving of a whole grain or millet (about 20–30 g carbs). Try it in the plate builder below.</p></div></div>
        <p class="small mt" style="margin-bottom:6px">Your last 30 days: lunch skipped on <b>${skip.length}</b> of ${d30.length} logged days.</p>
        ${skip.length >= 3 && eat.length >= 3 ? `<div class="table-wrap"><table><thead><tr><th>Average</th><th>Lunch skipped</th><th>Lunch eaten</th></tr></thead><tbody>${cmpRow('Protein', 'protein', ' g')}${cmpRow('Hair fall', 'fall', '/day')}${cmpRow('Breakouts', 'breakouts', '', 1)}${cmpRow('Skin score', 'skinScore', '')}</tbody></table></div>` : '<p class="tiny muted">Log meals for a couple of weeks to see how skipping lunch affects you.</p>'}
      </div>
    </div>

    <div class="card section"><div class="row between"><h3>Plate builder · lunch</h3><div class="chips"><button class="chip ${plateMode === 'low' ? 'on' : ''}" data-act="plateMode" data-v="low">Lower-carb (≤30 g)</button><button class="chip ${plateMode === 'bal' ? 'on' : ''}" data-act="plateMode" data-v="bal">Balanced (${Math.round(t.carbs * 0.3)} g)</button></div></div>
      <div class="chips" style="margin-bottom:14px"><span class="small muted" style="align-self:center">Start from:</span>${Object.entries(PLATES).map(([k, [n]]) => `<button class="chip" data-act="platePreset" data-v="${k}">${n}</button>`).join('')}<button class="chip" data-act="platePreset" data-v="">Clear</button></div>
      <div class="split">
        <div class="stack" style="gap:14px">${groups.map((g) => `<div><div class="tiny muted" style="letter-spacing:.15em;margin-bottom:6px">${g.toUpperCase()}</div><div class="foods">${FOODS.filter((f) => f.group === g).map((f) => {
          const q = items[f.id] || 0;
          return `<div class="food ${q ? 'on' : ''}"><div class="nm"><b>${esc(f.name)}</b><br><span class="tiny muted">${esc(f.serving)} · ${f.c} g carbs · ${f.p} g protein</span></div><div class="q"><button data-act="food" data-id="${f.id}" data-d="-1" aria-label="Less ${esc(f.name)}">−</button><span class="num" style="min-width:14px;text-align:center">${q}</span><button data-act="food" data-id="${f.id}" data-d="1" aria-label="More ${esc(f.name)}">+</button></div></div>`;
        }).join('')}</div></div>`).join('')}</div>
        <div class="card" style="position:sticky;top:84px;background:var(--panel-solid)"><h3>This lunch</h3>
          <div class="v num" style="font-family:var(--font-display);font-size:2rem">${Math.round(tot.kcal)}<span class="small muted"> kcal</span></div>
          <div class="stack mt">${tbar('Carbs', tot.c, lunchC, 'g', 'var(--skin)', true)}${tbar('Protein', tot.p, lunchP, 'g', '#ffd27a')}${tbar('Fibre', tot.fib, lunchFib, 'g', 'var(--good)')}${tbar('Energy', tot.kcal, lunchK, 'kcal', 'var(--hair)', true)}</div>
          <div class="stack mt">${notes.map(([lv, txt]) => `<div class="insight ${lv}"><div class="ic">${lv === 'good' ? '✓' : lv === 'warn' ? '!' : 'i'}</div><div><p style="color:var(--text);margin:0">${txt}</p></div></div>`).join('')}</div>
          <button class="btn primary mt" style="width:100%" data-act="logPlate" ${tot.kcal ? '' : 'disabled'}>Log as today's lunch (+${Math.round(tot.p)} g protein)</button>
          <p class="tiny muted" style="margin:8px 0 0">Values are approximate per serving (IFCT 2017, USDA). Carbs exclude fibre. Oil, ghee and tadka add about 45 kcal per teaspoon.</p>
        </div>
      </div>
    </div>

    <div class="card section"><h3>Nutrients that matter for skin & hair</h3>
      <div class="table-wrap"><table><thead><tr><th>Nutrient</th><th>Your daily target</th><th>Why it matters</th><th>Indian food sources</th></tr></thead><tbody>
        ${NUTRIENTS.map(([n, fn, why, src]) => `<tr><td><b>${n}</b></td><td class="num" style="white-space:nowrap">${fn(t, p)}</td><td class="small">${why}</td><td class="small muted">${src}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="tiny muted" style="margin:10px 0 0">Targets are ICMR-NIN 2020 RDAs for adults unless marked. Take supplements only for a confirmed deficiency: too much vitamin A or selenium can itself cause hair loss. If you are shedding a lot, ask your doctor for ferritin, vitamin D, B12 and thyroid (TSH) tests.</p>
    </div>

    <div class="card section"><h3>A day that hits your targets</h3>
      <div class="table-wrap"><table><thead><tr><th>Meal</th><th>Energy</th><th>Protein</th><th>Example</th></tr></thead><tbody>
        ${[['Breakfast', 0.25, '2 besan chillas with paneer + 1 cup curd, or 2 eggs + 1 roti + guava'], ['Lunch', 0.3, 'Lower-carb plate: paneer or chicken + sabzi + salad + 1 millet roti + chaas'], ['Snack', 0.15, 'Roasted chana + an apple, or sprouts chaat + buttermilk'], ['Dinner', 0.3, 'Dal or fish + leafy sabzi + 1–2 rotis or ½ cup rice + salad']].map(([m, f, ex]) => `<tr><td><b>${m}</b></td><td class="num">${Math.round(t.kcal * f)} kcal</td><td class="num">${Math.round(t.protein * f)} g</td><td class="small muted">${ex}</td></tr>`).join('')}
      </tbody></table></div></div>

    <div class="card section"><h3>Sources</h3><ul class="refs">
      <li>ICMR-NIN (2020). Nutrient Requirements for Indians: Recommended Dietary Allowances and Estimated Average Requirements.</li>
      <li>ICMR-NIN (2024). Dietary Guidelines for Indians.</li>
      <li>Mifflin MD et al. (1990). A new predictive equation for resting energy expenditure in healthy individuals. Am J Clin Nutr.</li>
      <li>Institute of Medicine (2005). Dietary Reference Intakes for Energy, Carbohydrate, Fiber, Fat, Fatty Acids, Cholesterol, Protein, and Amino Acids.</li>
      <li>EFSA Panel (2010). Scientific Opinion on Dietary Reference Values for water; and for fats, including EPA + DHA.</li>
      <li>Liu D et al. (2022). Calorie restriction with or without time-restricted eating in weight loss. N Engl J Med.</li>
      <li>Smith RN et al. (2007). A low-glycemic-load diet improves symptoms in acne vulgaris patients. Am J Clin Nutr.</li>
      <li>Almohanna HM et al. (2019). The role of vitamins and minerals in hair loss: a review. Dermatol Ther.</li>
      <li>Longvah T et al. (2017). Indian Food Composition Tables. NIN, Hyderabad.</li>
    </ul></div>`;
  };

  /* ---------- sleep monitor ---------- */
  let ringing = false, missedShown = false, wakeLock = null;
  const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const dur = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return `${Math.floor(m / 60)} h ${pad(m % 60)} m`; };
  function alarmToday() { const [h, m] = db.sleep.alarm.split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0); return d; }
  function bedFor(hours, latency = 15) { return hm(new Date(alarmToday().getTime() - hours * 36e5 - latency * 60e3)); }
  function nextAlarm(from = new Date()) {
    const s = db.sleep; if (!s.alarmOn || !s.days.length) return null;
    const [h, m] = s.alarm.split(':').map(Number);
    for (let i = 0; i < 8; i++) { const d = new Date(from); d.setDate(d.getDate() + i); d.setHours(h, m, 0, 0); if (d > from && s.days.includes(d.getDay())) return d; }
    return null;
  }
  function nightHours(date) {
    const ss = db.sleep.sessions.filter((x) => iso(new Date(x.end)) === date);
    if (ss.length) return ss.reduce((a, x) => a + (x.end - x.start) / 36e5, 0);
    return db.logs[date]?.life.sleep ?? null;
  }
  const nightQuality = (date) => db.sleep.sessions.filter((x) => iso(new Date(x.end)) === date && x.quality).at(-1)?.quality ?? null;
  const alarmSound = {
    ctx: null, timer: null,
    unlock() { try { this.ctx ||= new (window.AudioContext || window.webkitAudioContext)(); this.ctx.resume(); } catch { this.ctx = null; } },
    beep(vol = 0.3) {
      if (!this.ctx) return; const t0 = this.ctx.currentTime;
      [0, 0.22, 0.44].forEach((off, k) => {
        const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = 'sine'; o.frequency.value = k === 2 ? 1175 : 880;
        g.gain.setValueAtTime(0.0001, t0 + off); g.gain.exponentialRampToValueAtTime(vol, t0 + off + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + off + 0.18);
        o.connect(g).connect(this.ctx.destination); o.start(t0 + off); o.stop(t0 + off + 0.2);
      });
    },
    start() { this.stop(); this.unlock(); let n = 0; const go = () => { this.beep(Math.min(0.7, 0.12 + n * 0.03)); n++; try { navigator.vibrate?.([300, 150, 300]); } catch {} }; go(); this.timer = setInterval(go, 1300); },
    stop() { clearInterval(this.timer); this.timer = null; try { navigator.vibrate?.(0); } catch {} },
  };
  async function keepAwake() { try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { wakeLock = null; } }
  function showNight() { $('#night').classList.remove('hidden'); updateNight(); }
  function hideNight() { $('#night').classList.add('hidden'); }
  function updateNight() {
    const a = db.sleep.active, n = $('#night'); if (!a || n.classList.contains('hidden')) return;
    $('#nclock').textContent = hm(new Date());
    $('#nsub').textContent = ringing ? 'Good morning! Time to wake up.' : a.alarmAt ? `Alarm ${hm(new Date(a.alarmAt))} · rings in ${dur(a.alarmAt - Date.now())}` : `Asleep for ${dur(Date.now() - a.start)} · no alarm set`;
    $('#nSnooze').hidden = !ringing; n.classList.toggle('ring', ringing);
  }
  function startSleep() {
    alarmSound.unlock();
    db.sleep.active = { start: Date.now(), alarmAt: nextAlarm()?.getTime() ?? null };
    missedShown = false; save(); keepAwake(); showNight(); render();
  }
  function endSleep(endTs) {
    const a = db.sleep.active; if (!a) return;
    alarmSound.stop(); ringing = false; db.sleep.active = null;
    try { wakeLock?.release(); } catch {} wakeLock = null;
    hideNight();
    const hrs = (endTs - a.start) / 36e5;
    if (hrs < 0.5 || hrs > 16) { save(); toast(hrs < 0.5 ? 'Under 30 minutes, so this night was not saved' : 'Over 16 hours, so this was not saved. Add the night by hand on the Sleep page.'); return render(); }
    const sess = { id: uid(), start: a.start, end: endTs, quality: null };
    db.sleep.sessions.push(sess);
    const date = iso(new Date(endTs)), l = ensureLog(date); l.life.sleep = clamp(Math.round(hrs * 2) / 2, 3, 11);
    save(); render();
    setTimeout(() => dialog(`<h3>You slept ${dur(endTs - a.start)}</h3><p class="small muted">Saved to ${fmtDay(date)}'s check-in. How well did you sleep?</p><div class="chips">${['Awful', 'Poor', 'OK', 'Good', 'Great'].map((q, i) => `<button class="chip" data-act="quality" data-id="${sess.id}" data-v="${i + 1}">${q}</button>`).join('')}</div>`, [{ label: 'Skip' }]), 60);
  }
  function missedPrompt() {
    const a = db.sleep.active; hideNight();
    dialog(`<h3>Good morning</h3><p class="small">You started sleep at <b>${hm(new Date(a.start))}</b> and your alarm was set for <b>${hm(new Date(a.alarmAt))}</b>. The page was closed or the phone was asleep, so it could not ring. When did you get up?</p>`,
      [{ label: 'Cancel this night', cls: 'ghost', fn: () => { db.sleep.active = null; save(); render(); } },
        { label: 'Just now', fn: () => { setTimeout(() => endSleep(Date.now()), 0); } },
        { label: `At ${hm(new Date(a.alarmAt))}`, cls: 'primary', fn: () => { setTimeout(() => endSleep(a.alarmAt), 0); } }]);
  }
  function sleepTick() {
    const now = new Date(), c = $('#clock');
    if (c) { c.firstChild.nodeValue = hm(now); $('#clockSec').textContent = ':' + pad(now.getSeconds()); }
    const cd = $('#countdown');
    if (cd) { const na = db.sleep.active?.alarmAt ? new Date(db.sleep.active.alarmAt) : nextAlarm(); cd.textContent = na ? 'rings in ' + dur(na - now) : ''; }
    const a = db.sleep.active; if (!a) return;
    if (a.alarmAt && now >= a.alarmAt && !ringing) {
      if (now - a.alarmAt < 15 * 60e3) { ringing = true; alarmSound.start(); showNight(); }
      else if (!missedShown) { missedShown = true; missedPrompt(); }
    }
    updateNight();
  }
  function sleepBars(dates, vals, need) {
    const W = 720, H = 220, L = 32, R = 10, T = 12, B = 26, max = 11, n = dates.length, bw = (W - L - R) / n;
    const y = (v) => T + (1 - v / max) * (H - T - B);
    let g = `<rect x="${L}" y="${y(9)}" width="${W - L - R}" height="${y(7) - y(9)}" fill="rgba(157,255,106,0.07)"/><text x="${W - R - 4}" y="${y(9) + 13}" text-anchor="end" style="fill:#9dff6a">7–9 h healthy range</text>`;
    [0, 3, 6, 9].forEach((v) => (g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(130,150,255,0.12)"/><text x="${L - 6}" y="${y(v) + 3}" text-anchor="end">${v}h</text>`));
    g += `<line x1="${L}" x2="${W - R}" y1="${y(need)}" y2="${y(need)}" stroke="#a77bff" stroke-dasharray="4 4"/><text x="${L + 4}" y="${y(need) - 4}" style="fill:#a77bff">your goal ${need} h</text>`;
    dates.forEach((d, i) => {
      const v = vals[i], x = L + i * bw;
      if (v != null) { const col = v < 6 ? '#ff5c7a' : v < 7 ? '#ffc24b' : v <= 9 ? '#9dff6a' : '#6bb8ff'; g += `<rect x="${x + bw * 0.18}" y="${y(v)}" width="${bw * 0.64}" height="${y(0) - y(v)}" rx="5" fill="${col}" fill-opacity="0.85"><title>${fmtDay(d)}: ${round(v, 1)} h</title></rect>`; }
      if (i % 2 === n % 2 || i === n - 1) g += `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${fmtShort(d)}</text>`;
    });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Sleep per night">${g}</svg>`;
  }
  pages.sleep = () => {
    const s = db.sleep, na = nextAlarm(), a = s.active, d14 = lastDays(14);
    const hrs = d14.map(nightHours), last7 = lastDays(7).map(nightHours), avg7 = avg(last7);
    const debt = last7.reduce((acc, h) => acc + (h == null ? 0 : Math.max(0, s.need - h)), 0);
    const starts = s.sessions.filter((x) => x.end > Date.now() - 14 * 864e5).map((x) => { const d = new Date(x.start); let m = d.getHours() * 60 + d.getMinutes(); if (m < 720) m += 1440; return m; });
    const mean = avg(starts), sd = starts.length > 2 ? Math.sqrt(avg(starts.map((m) => (m - mean) ** 2))) : null;
    const q = avg(d14.map(nightQuality));
    const ls = lastDays(60).map((d) => db.logs[d]).filter(Boolean), good = ls.filter((l) => l.life.sleep >= 7), bad = ls.filter((l) => l.life.sleep < 6.5);
    const cmp = (k) => [avg(good.map((l) => METRICS[k].get(l))), avg(bad.map((l) => METRICS[k].get(l)))];
    const [gs, bs] = cmp('skinScore'), [gf, bf] = cmp('fall');
    const now = new Date();
    return `${demoBanner()}<div class="page-head"><span class="eyebrow">Sleep</span><h1>Sleep <span class="grad-text">monitor</span></h1>
      <p>Set your alarm here and tap <b>Start sleep</b> at bedtime. The monitor rings at your alarm time, records how long you slept, and fills in your daily check-in automatically.</p></div>
    <div class="split">
      <div class="card tilt"><span class="eyebrow">Now · ${fmtDay(today())}</span>
        <div class="bigclock num" id="clock">${hm(now)}<span id="clockSec">:${pad(now.getSeconds())}</span></div>
        <p style="margin:6px 0 2px">${a ? `Sleeping since <b>${hm(new Date(a.start))}</b>` : na ? `Next alarm <b>${hm(na)}</b> ${iso(na) === today() ? 'today' : na.toLocaleDateString('en-IN', { weekday: 'long' })}` : 'Alarm is off'}</p>
        <div class="small muted num" id="countdown"></div>
        <div class="row mt">${a ? '<button class="btn primary" data-act="showNight">Open sleep mode</button>' : '<button class="btn primary" data-act="startSleep">☾ Start sleep now</button>'}<button class="btn" data-act="testSound">Test alarm sound</button></div>
        <p class="tiny muted" style="margin:14px 0 0">Keep this tab open and your phone charging overnight. Phones can pause pages in the background, so keep your phone's own alarm as a backup. If the page could not ring, it asks you in the morning and uses your alarm time as your wake time.</p>
      </div>
      <form class="card" data-form="alarm"><h3>Alarm</h3>
        <div class="row"><button type="button" class="toggle ${s.alarmOn ? 'on' : ''}" data-act="alarmOn">${s.alarmOn ? '✓ Alarm on' : '○ Alarm off'}</button></div>
        <div class="grid" style="grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px">
          <div><label for="alarmTime">Wake-up time</label><input type="time" id="alarmTime" name="alarm" value="${s.alarm}" required></div>
          <div><label for="sleepNeed">Sleep goal</label><select id="sleepNeed" name="need">${[7, 7.5, 8, 8.5, 9].map((h) => `<option value="${h}" ${s.need === h ? 'selected' : ''}>${h} hours</option>`).join('')}</select></div>
        </div>
        <label class="mt">Repeat on</label>
        <div class="chips">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((dd, i) => `<button type="button" class="chip ${s.days.includes(i) ? 'on' : ''}" data-act="alarmDay" data-v="${i}">${dd}</button>`).join('')}</div>
        <div class="row mt"><button class="btn primary sm">Save alarm</button><a class="btn sm ghost" target="_blank" rel="noopener" href="${calLink('Wake up ☀', s.alarm, 'FREQ=WEEKLY;BYDAY=' + s.days.map((d) => ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][d]).join(','))}">📅 Backup in Google Calendar</a></div>
      </form>
    </div>

    <div class="card section"><h3>Bedtime calculator</h3>
      <p class="small muted">Sleep runs in cycles of roughly 90 minutes (anywhere from 70 to 120), so waking at the end of one can feel easier. Allowing about 15 minutes to fall asleep, for your <b>${s.alarm}</b> alarm go to bed at:</p>
      <div class="grid g4">${[[6, 9], [5, 7.5], [4, 6]].map(([cy, h]) => `<div class="tile" style="${h >= 7 ? '' : 'opacity:.65'}"><div class="k">${cy} cycles · ${h} h</div><div class="v num" style="color:${h >= 7 ? 'var(--good)' : 'var(--bad)'}">${bedFor(h)}</div><div class="tiny muted">${h >= 7 ? 'Meets the 7+ hour guideline' : 'Too short for regular use'}</div></div>`).join('')}
        <div class="tile"><div class="k">Your goal · ${s.need} h</div><div class="v num" style="color:var(--hair)">${bedFor(s.need)}</div><div class="tiny muted">Lights out by this time</div></div></div>
    </div>

    <div class="grid g4 section">
      <div class="card tilt metric"><h3>Average, 7 nights</h3><div class="v num" style="color:${avg7 == null ? 'inherit' : avg7 >= 7 ? 'var(--good)' : 'var(--warn)'}">${avg7 == null ? '—' : round(avg7, 1)}<small> h</small></div></div>
      <div class="card tilt metric"><h3>Sleep debt, 7 nights</h3><div class="v num">${round(debt, 1)}<small> h short</small></div><span class="tiny muted">vs your ${s.need} h goal</span></div>
      <div class="card tilt metric"><h3>Bedtime consistency</h3><div class="v num">${sd == null ? '—' : '±' + Math.round(sd)}<small> min</small></div><span class="tiny muted">${sd == null ? 'needs tracked nights' : sd <= 30 ? 'steady, good for your body clock' : 'try to keep it within ±30 min'}</span></div>
      <div class="card tilt metric"><h3>Sleep quality</h3><div class="v num">${q == null ? '—' : round(q, 1)}<small> / 5</small></div><span class="tiny muted">your morning rating</span></div>
    </div>

    <div class="card section"><h3>Last 14 nights</h3>${sleepBars(d14, hrs, s.need)}</div>

    <div class="grid g2 section">
      <form class="card" data-form="night"><h3>Add or fix a night</h3>
        <div class="grid" style="grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">
          <div><label for="nDate">Morning you woke up</label><input type="date" id="nDate" name="date" value="${today()}" max="${today()}" required></div>
          <div><label for="nQ">Quality</label><select id="nQ" name="quality">${['Awful', 'Poor', 'OK', 'Good', 'Great'].map((t, i) => `<option value="${i + 1}" ${i === 3 ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
          <div><label for="nBed">Went to sleep</label><input type="time" id="nBed" name="bed" value="23:00" required></div>
          <div><label for="nWake">Woke up</label><input type="time" id="nWake" name="wake" value="${s.alarm}" required></div>
        </div><button class="btn primary sm mt">Save night</button></form>
      <div class="card"><h3>Sleep, skin & hair</h3>
        ${gs != null && bs != null && good.length >= 3 && bad.length >= 3 ? `<div class="table-wrap"><table><thead><tr><th>Your average</th><th>After 7 h+</th><th>After under 6.5 h</th></tr></thead><tbody><tr><td>Skin score</td><td class="num">${Math.round(gs)}</td><td class="num">${Math.round(bs)}</td></tr><tr><td>Hair fall</td><td class="num">${Math.round(gf)}/day</td><td class="num">${Math.round(bf)}/day</td></tr></tbody></table></div>` : '<p class="small muted">After a couple of weeks of tracked nights, this compares your skin and hair after good and short sleep.</p>'}
        <ul class="clean small mt">
          <li>Adults need <b>7 hours or more</b> on a regular basis (AASM & Sleep Research Society consensus, Watson et al., 2015).</li>
          <li>Keep the same wake time every day, weekends included, and get daylight soon after waking.</li>
          <li>Caffeine taken even 6 hours before bed cut sleep by about an hour (Drake et al., 2013). Make your last tea or coffee by ${bedFor(s.need + 6, 0)}.</li>
          <li>In a small study, poor sleepers showed more signs of skin ageing and slower skin-barrier recovery (Oyetakin-White et al., 2015).</li>
          <li>Loud snoring, gasping at night, or daytime sleepiness despite enough hours are worth discussing with a doctor.</li>
        </ul></div>
    </div>`;
  };

  /* ---------- me / settings ---------- */
  const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  function calLink(title, hm, rrule) {
    const d = new Date(); const [h, m] = hm.split(':'); d.setHours(+h, +m, 0, 0); if (d < new Date()) d.setDate(d.getDate() + 1);
    const f = (x) => x.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(title) + '&dates=' + f(d) + '/' + f(new Date(d.getTime() + 600000)) + '&recur=' + encodeURIComponent('RRULE:' + rrule) + '&details=' + encodeURIComponent('Reminder from AURA Monitor');
  }
  pages.me = () => {
    const p = db.profile, n = Object.keys(db.logs).length;
    return `<div class="page-head"><span class="eyebrow">Me</span><h1>Profile & <span class="grad-text">reminders</span></h1></div>
    <div class="grid g2">
      <form class="card" data-form="profile"><h3>Profile</h3>
        <label for="pName">Name</label><input type="text" id="pName" name="name" value="${esc(p.name)}" placeholder="What should we call you?">
        <div class="grid" style="grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:12px">
          <div><label for="pSkin">Skin type</label><select id="pSkin" name="skinType">${['Oily', 'Dry', 'Combination', 'Normal', 'Sensitive'].map((t) => `<option ${p.skinType === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
          <div><label for="pHair">Hair type</label><select id="pHair" name="hairType">${['Straight', 'Wavy', 'Curly', 'Coily'].map((t) => `<option ${p.hairType === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div></div>
        <button class="btn primary sm mt">Save profile</button></form>

      <div class="card"><h3>Your data</h3>
        <p class="small">${n} days logged · ${db.scans.length} photo scans${db.demo ? ' · <span class="pill warn">sample data</span>' : ''}</p>
        <p class="tiny muted">Everything is stored only in this browser. Copy a backup to move it to another device.</p>
        <div class="row"><button class="btn sm" data-act="export">Copy backup</button><button class="btn sm" data-act="import">Restore backup</button>
          ${db.demo ? '<button class="btn sm primary" data-act="startFresh">Remove sample data</button>' : '<button class="btn sm ghost" data-act="loadDemo">Load sample data</button>'}
          <button class="btn sm danger" data-act="wipe">Delete everything</button></div></div>

      <div class="card"><h3>Reminders</h3>
        <p class="tiny muted">They pop up here while the page is open. Tap 📅 to add one to Google Calendar so your phone reminds you too.</p>
        <div class="stack" style="gap:6px">${db.reminders.map((r) => `<div class="step-edit" style="flex-wrap:wrap">
          <button class="toggle ${r.on ? 'on' : ''}" data-act="remOn" data-id="${r.id}" style="padding:4px 9px;width:auto;height:auto">${r.on ? 'On' : 'Off'}</button>
          <span class="small">${esc(r.label)}<br><span class="row" style="gap:3px;margin-top:4px">${DAYS.map((dd, i) => `<button class="chip ${r.days.includes(i) ? 'on' : ''}" style="padding:1px 7px;font-size:.7rem;width:auto;height:auto" data-act="remDay" data-id="${r.id}" data-v="${i}">${dd}</button>`).join('')}</span></span>
          <input type="time" value="${r.time}" style="width:auto" data-rem-time="${r.id}" aria-label="Time for ${esc(r.label)}">
          <a class="btn sm ghost" target="_blank" rel="noopener" data-ext href="${calLink(r.label, r.time, 'FREQ=WEEKLY;BYDAY=' + r.days.map((d) => ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][d]).join(','))}" title="Add to Google Calendar">📅</a>
          <button data-act="remDel" data-id="${r.id}" aria-label="Delete reminder">✕</button></div>`).join('')}</div>
        <form class="row mt" data-form="addRem"><input type="text" id="remLabel" name="label" placeholder="e.g. Hair oiling" required style="flex:1;min-width:140px"><input type="time" id="remTime" name="time" value="21:00" style="width:auto"><button class="btn sm primary">Add</button></form>
      </div>

      <div class="card"><h3>Privacy & safety</h3>
        <p class="small">Your logs and photos never leave this device. Nothing is sent to a server or used to train any model. Clearing your browser data removes them.</p>
        <p class="small">AURA Monitor shows patterns in what you log; it cannot diagnose. Photo scores are colour-based estimates that change with lighting.</p>
        <div class="insight bad"><div class="ic">⚕</div><div><b>See a dermatologist if…</b><p>a mole changes, itches or bleeds · hair comes out in clumps or patches · acne is painful, deep or scarring · a rash spreads, blisters or comes with fever · nothing improves after 8 weeks.</p></div></div>
      </div>
    </div>`;
  };
  function remTick() {
    const now = new Date(), hm = now.toTimeString().slice(0, 5), key = today() + ' ' + hm;
    if (store.get('remFired', '') === key) return;
    const due = db.reminders.filter((r) => r.on && r.time === hm && r.days.includes(now.getDay())).map((r) => r.label);
    if (!due.length) return;
    store.set('remFired', key);
    due.forEach((d) => toast('⏰ ' + d));
  }

  /* ================= actions ================= */
  function act(el) {
    const a = el.dataset.act, d = el.dataset;
    switch (a) {
      case 'step': { const l = ensureLog(); setPath(l, d.path, clamp((getPath(l, d.path) ?? 0) + +d.d, 0, d.path === 'hair.fall' ? 500 : d.path === 'life.protein' ? 300 : 50)); persist(); return render(); }
      case 'set': { const l = ensureLog(); setPath(l, d.path, +d.v); persist(); return render(); }
      case 'flip': { const l = d.today ? ensureLog(today()) : ensureLog(); setPath(l, d.path, !getPath(l, d.path)); persist(); return render(); }
      case 'water': { const l = ensureLog(); l.life.water = l.life.water === +d.v ? +d.v - 1 : +d.v; persist(); return render(); }
      case 'zone': { const l = ensureLog(), z = l.skin.zones, i = z.indexOf(d.z); i >= 0 ? z.splice(i, 1) : z.push(d.z); if (z.length && !l.skin.breakouts) l.skin.breakouts = 1; persist(); return render(); }
      case 'flag': { const l = ensureLog(), i = l.flags.indexOf(d.id); i >= 0 ? l.flags.splice(i, 1) : l.flags.push(d.id); persist(); return render(); }
      case 'done': { const l = ensureLog(d.date), arr = l.done[d.w], i = arr.indexOf(d.id); i >= 0 ? arr.splice(i, 1) : arr.push(d.id); persist(); return render(); }
      case 'day': return go('#/log/' + addDays(logDate, +d.d));
      case 'glass': { const l = ensureLog(today()); l.life.water = clamp(l.life.water + +d.v, 0, 24); save(); return render(); }
      case 'food': db.plate.items[d.id] = clamp((db.plate.items[d.id] || 0) + +d.d, 0, 6); save(); return render();
      case 'plateMode': plateMode = d.v; return render();
      case 'platePreset': db.plate.items = d.v ? { ...PLATES[d.v][1] } : {}; save(); return render();
      case 'logPlate': {
        const tot = plateTotals(db.plate.items), l = ensureLog(today());
        l.life.meals.l = true; l.life.protein = Math.round((l.life.protein || 0) + tot.p); save();
        toast(`Lunch logged: +${Math.round(tot.p)} g protein today`); return render();
      }
      case 'startSleep': return startSleep();
      case 'showNight': return showNight();
      case 'hideNight': return hideNight();
      case 'wake': return endSleep(Date.now());
      case 'snooze': db.sleep.active.alarmAt = Date.now() + 9 * 60e3; ringing = false; alarmSound.stop(); save(); return updateNight();
      case 'cancelSleep': return askConfirm('Stop tracking tonight without saving it?', () => { db.sleep.active = null; alarmSound.stop(); ringing = false; try { wakeLock?.release(); } catch {} save(); hideNight(); render(); }, 'Cancel night');
      case 'testSound': alarmSound.unlock(); alarmSound.beep(0.4); return toast('If you heard three beeps, the alarm sound works');
      case 'alarmOn': db.sleep.alarmOn = !db.sleep.alarmOn; save(); return render();
      case 'alarmDay': { const v = +d.v, ds = db.sleep.days; db.sleep.days = ds.includes(v) ? ds.filter((x) => x !== v) : [...ds, v].sort(); save(); return render(); }
      case 'quality': { const x = db.sleep.sessions.find((q) => q.id === d.id); if (x) x.quality = +d.v; save(); $('#modal').classList.add('hidden'); toast('Thanks, saved'); return render(); }
      case 'heatKey': heatKey = d.v; return render();
      case 'layer': layer = d.v; $$('[data-act="layer"]').forEach((c) => { const on = c.dataset.v === layer, col = FTYPE[c.dataset.v]?.[1]; c.classList.toggle('on', on); c.style.background = on && col ? col : ''; c.style.borderColor = on && col ? col : ''; }); return Viewer.setLayer();
      case 'focusFind': Viewer.focus = Viewer.focus === +d.i ? null : +d.i; $$('.find').forEach((x) => x.classList.toggle('on', +x.dataset.i === Viewer.focus)); return;
      case 'openScan': { const sc = db.scans.find((x) => x.id === d.id); if (sc) runScan({}, { src: sc.img, history: sc, kind: sc.kind, quiet: true }); return; }
      case 'addPlan': return addPlanToRoutine();
      case 'wire': Viewer.wireOn = !Viewer.wireOn; el.classList.toggle('on', Viewer.wireOn); return;
      case 'pick': {
        cmp = cmp.includes(d.id) ? cmp.filter((x) => x !== d.id) : [...cmp, d.id].slice(-2);
        const dt = (id) => db.scans.find((x) => x.id === id)?.date || '';
        cmp.sort((x, y) => dt(x).localeCompare(dt(y))); return render();
      }
      case 'cmpClear': cmp = []; return render();
      case 'delScan': return askConfirm('Delete this scan photo?', () => { db.scans = db.scans.filter((x) => x.id !== d.id); cmp = cmp.filter((x) => x !== d.id); if (current?.id === d.id) current = null; save(); render(); });
      case 'range': trendRange = +d.v; return render();
      case 'metric': { const i = trendSel.indexOf(d.v); if (i >= 0) trendSel.splice(i, 1); else { trendSel.push(d.v); if (trendSel.length > 4) trendSel.shift(); } return render(); }
      case 'mv': { const l = db.routine[d.w], i = +d.i, j = i + +d.d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; save(); return render(); }
      case 'rmStep': return askConfirm('Remove this step from your routine?', () => { db.routine[d.w] = db.routine[d.w].filter((s) => s.id !== d.id); save(); render(); }, 'Remove');
      case 'remOn': { const r = db.reminders.find((x) => x.id === d.id); r.on = !r.on; save(); return render(); }
      case 'remDay': { const r = db.reminders.find((x) => x.id === d.id), v = +d.v; r.days = r.days.includes(v) ? r.days.filter((x) => x !== v) : [...r.days, v].sort(); save(); return render(); }
      case 'remDel': db.reminders = db.reminders.filter((x) => x.id !== d.id); save(); return render();
      case 'export': {
        const txt = JSON.stringify(db);
        return dialog(`<h3>Your backup</h3><p class="small muted">Copy this and keep it somewhere safe. Paste it into "Restore backup" on another device.</p><textarea rows="8" readonly>${esc(txt)}</textarea>`, [{ label: 'Close', cls: 'ghost' }, { label: 'Copy', cls: 'primary', fn: () => { copyText(txt); return false; } }]);
      }
      case 'import':
        return dialog(`<h3>Restore backup</h3><p class="small muted">Paste your backup text, or choose a backup file.</p><textarea id="importBox" rows="8"></textarea><input type="file" id="importFile" accept="application/json,.json,.txt" class="mt">`,
          [{ label: 'Cancel', cls: 'ghost' }, { label: 'Restore', cls: 'primary', fn: () => { restore(); return false; } }]);
      case 'wipe': return askConfirm('Delete all logs, photos, routine and settings on this device? This cannot be undone.', () => { db = fresh(); save(); toast('Everything deleted'); go('#/'); }, 'Delete everything');
      case 'startFresh': return askConfirm('Remove the sample data and start tracking your own? Your routine, reminders and profile stay.', () => {
        db = { ...fresh(), profile: db.profile, routine: db.routine, reminders: db.reminders, demo: false }; save(); toast('Ready. Log your first day!'); go('#/log');
      }, 'Start fresh');
      case 'loadDemo': return askConfirm('Replace your data with 45 days of sample data?', () => { db = fresh(); seedDemo(db); save(); go('#/'); }, 'Load sample');
    }
  }
  async function restore() {
    try {
      const f = $('#importFile').files[0];
      const j = JSON.parse(f ? await f.text() : $('#importBox').value);
      if (!j.logs) throw new Error('no logs');
      db = { ...fresh(), ...j }; save(); $('#modal').classList.add('hidden'); toast('Backup restored'); go('#/');
    } catch { toast('That backup could not be read. Paste the complete text you copied.'); }
  }
  function onForm(form, e) {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(form));
    if (form.dataset.form === 'addStep') { db.routine[fd.when].push({ id: uid(), name: fd.name.trim(), kind: fd.kind }); toast('Step added'); }
    if (form.dataset.form === 'profile') { Object.assign(db.profile, fd); toast('Profile saved'); }
    if (form.dataset.form === 'body') { Object.assign(db.profile, { sex: fd.sex, age: +fd.age, weight: +fd.weight, height: +fd.height, activity: fd.activity, goal: fd.goal }); toast('Targets updated'); }
    if (form.dataset.form === 'alarm') { db.sleep.alarm = fd.alarm; db.sleep.need = +fd.need; if (db.sleep.active && !ringing) db.sleep.active.alarmAt = nextAlarm(new Date(db.sleep.active.start))?.getTime() ?? null; toast('Alarm saved for ' + fd.alarm); }
    if (form.dataset.form === 'night') {
      const end = new Date(fd.date + 'T' + fd.wake), start = new Date(fd.date + 'T' + fd.bed);
      if (start >= end) start.setDate(start.getDate() - 1);
      const h = (end - start) / 36e5;
      if (h < 1 || h > 16) { toast('That night is ' + round(h, 1) + ' h long. Check the times.'); return; }
      db.sleep.sessions = db.sleep.sessions.filter((x) => iso(new Date(x.end)) !== fd.date);
      db.sleep.sessions.push({ id: uid(), start: start.getTime(), end: end.getTime(), quality: +fd.quality });
      const l = ensureLog(fd.date); l.life.sleep = clamp(Math.round(h * 2) / 2, 3, 11);
      toast(`Saved ${round(h, 1)} h for ${fmtDay(fd.date)}`);
    }
    if (form.dataset.form === 'addRem') { db.reminders.push({ id: uid(), label: fd.label, time: fd.time, days: [0, 1, 2, 3, 4, 5, 6], on: true }); toast('Reminder added'); }
    save(); render();
  }

  /* ================= effects: particle field, cursor glow, parallax, 3D tilt ================= */
  const fx = {
    tx: 0, ty: 0, cx: 0, cy: 0, mx: -9999, my: -9999, t: 0, parts: [],
    hover: matchMedia('(hover: hover)').matches, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
    init() {
      this.cv = $('#fx'); this.ctx = this.cv.getContext('2d'); this.glow = $('#glow');
      const resize = () => {
        const dpr = Math.min(2, devicePixelRatio || 1); this.w = innerWidth; this.h = innerHeight;
        this.cv.width = this.w * dpr; this.cv.height = this.h * dpr; this.cv.style.width = this.w + 'px'; this.cv.style.height = this.h + 'px';
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const n = Math.round(clamp((this.w * this.h) / 13000, 30, 110)), r = rng(3);
        this.parts = Array.from({ length: n }, () => ({ x: r() * this.w, y: r() * this.h, vx: (r() - 0.5) * 0.25, vy: (r() - 0.5) * 0.25, z: 0.3 + r() * 0.7, c: r() < 0.5 ? '60,240,255' : r() < 0.7 ? '167,123,255' : '255,79,216' }));
        if (this.reduced) this.draw();
      };
      resize(); addEventListener('resize', resize);
      addEventListener('pointermove', (e) => {
        if (e.pointerType === 'mouse' || e.pointerType === 'pen') { this.mx = e.clientX; this.my = e.clientY; }
        this.tx = (e.clientX / innerWidth) * 2 - 1; this.ty = (e.clientY / innerHeight) * 2 - 1; this.last = performance.now();
        tilt(e);
      }, { passive: true });
      document.documentElement.addEventListener('pointerleave', () => { this.mx = this.my = -9999; this.tx = this.ty = 0; });
      if (this.reduced) return;
      const loop = () => { if (!document.hidden) { this.step(); this.draw(); } requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    },
    step() {
      this.t += 0.01;
      // without a mouse, let the panels sway gently on their own
      if (!this.hover && (!this.last || performance.now() - this.last > 1500)) { this.tx = Math.sin(this.t * 0.7) * 0.35; this.ty = Math.cos(this.t * 0.5) * 0.25; }
      this.cx += (this.tx - this.cx) * 0.06; this.cy += (this.ty - this.cy) * 0.06;
      const rs = document.documentElement.style;
      rs.setProperty('--px', this.cx.toFixed(4)); rs.setProperty('--py', this.cy.toFixed(4));
      if (this.hover) this.glow.style.transform = `translate3d(${this.mx}px, ${this.my}px, 0)`;
      for (const p of this.parts) {
        p.x += p.vx; p.y += p.vy;
        const dx = p.x - this.mx, dy = p.y - this.my, d2 = dx * dx + dy * dy;
        if (d2 < 14400 && d2 > 1) { const d = Math.sqrt(d2), f = (1 - d / 120) * 0.9; p.x += (dx / d) * f; p.y += (dy / d) * f; }
        if (p.x < -20) p.x = this.w + 20; if (p.x > this.w + 20) p.x = -20; if (p.y < -20) p.y = this.h + 20; if (p.y > this.h + 20) p.y = -20;
      }
    },
    draw() {
      const c = this.ctx, ps = this.parts; c.clearRect(0, 0, this.w, this.h);
      const ox = -this.cx * 26, oy = -this.cy * 26;
      for (let i = 0; i < ps.length; i++) {
        const a = ps[i], ax = a.x + ox * a.z, ay = a.y + oy * a.z;
        for (let j = i + 1; j < ps.length; j++) {
          const b = ps[j], bx = b.x + ox * b.z, by = b.y + oy * b.z, dx = ax - bx, dy = ay - by;
          if (dx * dx + dy * dy < 12100) { const d = Math.sqrt(dx * dx + dy * dy); c.strokeStyle = `rgba(${a.c},${((1 - d / 110) * 0.16).toFixed(3)})`; c.lineWidth = 1; c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke(); }
        }
        const dm = Math.hypot(ax - this.mx, ay - this.my);
        if (dm < 170) { c.strokeStyle = `rgba(${a.c},${((1 - dm / 170) * 0.5).toFixed(3)})`; c.beginPath(); c.moveTo(ax, ay); c.lineTo(this.mx, this.my); c.stroke(); }
        c.fillStyle = `rgba(${a.c},${(0.35 + a.z * 0.5).toFixed(2)})`; c.beginPath(); c.arc(ax, ay, 0.8 + a.z * 1.6, 0, 7); c.fill();
      }
    },
  };
  let tilted = null;
  function tilt(e) {
    if (fx.reduced || !fx.hover) return;
    const el = e.target.closest?.('.tilt');
    if (tilted && tilted !== el) { tilted.classList.remove('active'); tilted.style.removeProperty('--rx'); tilted.style.removeProperty('--ry'); tilted = null; }
    if (!el) return;
    const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--rx', ((0.5 - y) * 9).toFixed(2) + 'deg'); el.style.setProperty('--ry', ((x - 0.5) * 11).toFixed(2) + 'deg');
    el.style.setProperty('--mx', (x * 100).toFixed(1) + '%'); el.style.setProperty('--my', (y * 100).toFixed(1) + '%');
    el.classList.add('active'); tilted = el;
  }

  /* ================= router ================= */
  let route = '/', lastPath = null;
  const readHash = () => { try { return (location.hash.slice(1) || '/').split('?')[0]; } catch { return '/'; } };
  function go(h, push = true) {
    route = (h.replace(/^#/, '') || '/').split('?')[0];
    if (push) { try { history.pushState(null, '', '#' + route); } catch {} }
    render();
  }
  const routes = [
    [/^\/?$/, () => pages.dash(), '/'],
    [/^\/log(?:\/([\d-]+))?$/, (m) => pages.log(m[1]), '/log'],
    [/^\/scan$/, () => pages.scan(), '/scan'],
    [/^\/trends$/, () => pages.trends(), '/trends'],
    [/^\/fuel$/, () => pages.fuel(), '/fuel'],
    [/^\/sleep$/, () => pages.sleep(), '/sleep'],
    [/^\/routine$/, () => pages.routine(), '/routine'],
    [/^\/me$/, () => pages.me(), '/me'],
  ];
  function render() {
    let html = null, nav = '/';
    for (const [re, fn, n] of routes) {
      const m = route.match(re);
      if (m) { if (n === '/log' && !m[1] && lastPath !== route) logDate = today(); html = fn(m); nav = n; break; }
    }
    if (html == null) { route = '/'; html = pages.dash(); }
    const y = scrollY, app = $('#app');
    app.innerHTML = html;
    if (route !== lastPath) { scrollTo(0, 0); app.classList.remove('fade-in'); void app.offsetWidth; app.classList.add('fade-in'); } else scrollTo(0, y);
    lastPath = route; tilted = null;
    $$('#dock a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + nav));
    mount();
  }
  function mount() {
    requestAnimationFrame(() => requestAnimationFrame(() => $$('.ring-arc').forEach((c) => c.setAttribute('stroke-dashoffset', c.dataset.off))));
    $('#scanFile')?.addEventListener('change', (e) => e.target.files[0] && runScan(e.target.files[0]));
    $('#dashFile')?.addEventListener('change', (e) => { if (e.target.files[0]) { pendingFile = e.target.files[0]; current = null; go('#/scan'); } });
    $$('#drop, #dashDrop').forEach((drop) => {
      ['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
      ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
      drop.addEventListener('drop', (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (drop.id === 'dashDrop') { pendingFile = f; current = null; go('#/scan'); } else runScan(f); });
    });
    const vw = $('#viewer'); if (vw && current) Viewer.start(vw, current); else Viewer.stop();
    $('#reliefRange')?.addEventListener('input', (e) => { relief = +e.target.value; e.target.style.setProperty('--p', (relief / 2.5) * 100); Viewer.setRelief(); });
    if (pendingFile && route === '/scan') { const f = pendingFile; pendingFile = null; runScan(f); }
    $('#logDate')?.addEventListener('change', (e) => e.target.value && go('#/log/' + e.target.value));
    $('#baRange')?.addEventListener('input', (e) => e.target.parentElement.style.setProperty('--pos', e.target.value + '%'));
    $$('[data-rem-time]').forEach((el) => el.addEventListener('change', () => { db.reminders.find((r) => r.id === el.dataset.remTime).time = el.value; save(); render(); }));
  }

  let inputTimer, chartEl = null;
  function init() {
    db = loadDb();
    route = readHash();
    document.addEventListener('click', (e) => {
      const g = e.target.closest('[data-go]'); if (g) { e.preventDefault(); return go(g.dataset.go); }
      const a = e.target.closest('a[href^="#"]'); if (a) { e.preventDefault(); return go(a.getAttribute('href')); }
      const b = e.target.closest('[data-act]'); if (b && !b.disabled) { e.preventDefault(); act(b); }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') $('#modal').classList.add('hidden');
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.zone[data-act]')) { e.preventDefault(); act(e.target); }
    });
    document.addEventListener('submit', (e) => { const f = e.target.closest('[data-form]'); if (f) onForm(f, e); });
    document.addEventListener('input', (e) => {
      const el = e.target.closest('[data-bind]'); if (!el) return;
      const l = ensureLog(), num = el.type === 'range', v = num ? +el.value : el.value;
      setPath(l, el.dataset.bind, v);
      if (num) {
        el.style.setProperty('--p', ((v - el.min) / (el.max - el.min)) * 100);
        const out = $(`[data-out="${el.dataset.bind}"]`); if (out) out.textContent = v + (el.dataset.unit || '');
      }
      liveUpdate(); clearTimeout(inputTimer); inputTimer = setTimeout(persist, 250);
    });
    document.addEventListener('pointermove', (e) => {
      const w = e.target.closest?.('.chart-wrap');
      if (w) chartHover(w, e);
      if (chartEl && chartEl !== w) chartLeave(chartEl);
      chartEl = w;
    }, { passive: true });
    $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') e.target.classList.add('hidden'); });
    addEventListener('popstate', () => go(readHash(), false));
    addEventListener('hashchange', () => { const h = readHash(); if (h !== route) go(h, false); });
    render();
    fx.init();
    setInterval(remTick, 20000); remTick();
    setInterval(sleepTick, 1000);
    if (db.sleep.active) showNight();
    document.addEventListener('visibilitychange', () => { if (!document.hidden && db.sleep.active) { keepAwake(); sleepTick(); } });
  }
  document.addEventListener('DOMContentLoaded', init);

  return { go, render };
})();
