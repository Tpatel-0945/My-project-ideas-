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
      if (cb > 77 && cb < 130 && cr > 133 && cr < 180 && L[i] > 35) { skin[i] = 1; skinN++; }
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
      if (L[i] > mL + 1.6 * sdL && sat < 0.3) { masks.shine[i] = 1; shine++; }
      if (r - g > mRG + 1.5 * sdRG && r > 90) { masks.red[i] = 1; red++; }
      const lm = local(x, y); tv += Math.abs(L[i] - lm);
      if (L[i] < lm * 0.86) { masks.spots[i] = 1; spots++; }
    }
    const pct = (n, k) => Math.round(clamp((n / skinN) * k));
    return { coverage: skinN / N, masks, scores: { shine: pct(shine, 1500), redness: pct(red, 2500), spots: pct(spots, 2000), evenness: Math.round(clamp(100 - (tv / skinN) * 7)) } };
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

  function loadImage(file) {
    return new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = URL.createObjectURL(file); });
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
        <div class="row mt">
          <a class="btn primary" href="#/log">${tl ? 'Update today' : 'Log today'} →</a>
          <a class="btn" href="#/scan">Take a photo scan</a>
        </div>
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

  /* ---------- photo scan ---------- */
  let scanKind = 'skin', lastScan = null, cmp = [];
  const SCAN_LABELS = {
    skin: [['shine', 'Shine / oil', '#ffc24b'], ['redness', 'Redness', '#ff5c7a'], ['spots', 'Dark spots', '#ff4fd8'], ['evenness', 'Tone evenness', '#9dff6a']],
    hair: [['scalp', 'Scalp visible', '#ff4fd8'], ['density', 'Coverage', '#a77bff'], ['flakes', 'Flakes', '#d5c2ff']],
  };
  pages.scan = () => {
    const list = db.scans.filter((s) => s.kind === scanKind).sort((a, b) => a.date.localeCompare(b.date));
    const a = list.find((s) => s.id === cmp[0]), b = list.find((s) => s.id === cmp[1]);
    const labels = SCAN_LABELS[scanKind];
    return `${demoBanner()}<div class="page-head"><span class="eyebrow">Photo scan</span><h1>${scanKind === 'skin' ? 'Face' : 'Hair & scalp'} <span class="grad-text">scan</span></h1>
      <p>${scanKind === 'skin' ? 'Front-facing photo, daylight from a window, no makeup or filters. Same spot each week.' : 'Part your hair in the middle and photograph the parting from above in bright light. Same parting, same distance each time.'} The photo is analysed on this device and never uploaded.</p></div>
    <div class="chips" style="margin-bottom:18px"><button class="chip ${scanKind === 'skin' ? 'on' : ''}" data-act="scanKind" data-v="skin">◐ Face / skin</button><button class="chip hair ${scanKind === 'hair' ? 'on' : ''}" data-act="scanKind" data-v="hair">⌇ Hair parting / scalp</button></div>
    <div class="split">
      <div class="card">
        <label class="drop" id="drop" for="scanFile"><input type="file" accept="image/*" id="scanFile" hidden><div style="font-size:2rem">⇪</div><b>Drop a photo or tap to choose</b><div class="small muted">JPG or PNG</div></label>
        <div class="scanbox hidden" id="scanBox"><canvas id="scanCanvas"></canvas></div>
        <div class="row mt hidden" id="overlayCtl"><span class="small muted">Highlight:</span><button class="chip on" data-act="overlay" data-v="none">Off</button>${(scanKind === 'skin' ? [['shine', 'Shine'], ['red', 'Redness'], ['spots', 'Spots']] : [['scalp', 'Visible scalp'], ['flakes', 'Flakes']]).map(([k, t]) => `<button class="chip" data-act="overlay" data-v="${k}">${t}</button>`).join('')}</div>
      </div>
      <div class="card" id="scanResult"><h3>What it measures</h3>
        ${scanKind === 'skin' ? `<div class="stack small"><div class="insight info"><div class="ic">◍</div><div><b>Shine</b><p>Bright, colourless highlights. A rough guide to oiliness.</p></div></div><div class="insight info"><div class="ic">◉</div><div><b>Redness</b><p>Areas much redder than your average tone: pimples, irritation.</p></div></div><div class="insight info"><div class="ic">◐</div><div><b>Dark spots & evenness</b><p>Patches darker than their surroundings: marks, pigmentation.</p></div></div></div>`
        : `<div class="stack small"><div class="insight info"><div class="ic">⌇</div><div><b>Scalp visible</b><p>Share of the parting where scalp shows through. Falling over weeks means denser hair.</p></div></div><div class="insight info"><div class="ic">❄</div><div><b>Flakes</b><p>Tiny white specks on the hair: dandruff build-up.</p></div></div></div>`}
        <p class="tiny muted mt" style="margin-bottom:0">This is a colour-based estimate, not a medical device. Lighting changes results, so compare scans taken the same way.</p></div>
    </div>
    <div class="section">
      <div class="row between"><h2 style="margin:0">History</h2><span class="small muted">${list.length} scans${list.length > 1 ? ' · tap two photos to compare' : ''}</span></div>
      ${list.length > 1 ? `<div class="card mt">${lineChart('scanChart', list.map((s) => s.date), labels.map(([k, t, c]) => ({ label: t, color: c, vals: list.map((s) => s.scores?.[k] ?? null), max: 100 })), { h: 220 })}</div>` : ''}
      ${a && b ? `<div class="card mt"><div class="row between"><h3>Compare ${fmtShort(a.date)} → ${fmtShort(b.date)}</h3><button class="btn sm ghost" data-act="cmpClear">Close</button></div>
        <div class="ba mt" style="--pos:50%"><div class="layer"><img src="${a.img}" alt="Earlier scan"></div><div class="layer after"><img src="${b.img}" alt="Later scan"></div><span class="tag" style="left:10px">${fmtShort(a.date)}</span><span class="tag" style="right:10px">${fmtShort(b.date)}</span><div class="handle"></div>
        <input type="range" min="0" max="100" value="50" id="baRange" aria-label="Drag to compare"></div>
        <div class="grid g4 mt">${labels.map(([k, t, c]) => `<div class="metric"><span class="tiny muted">${t}</span><span class="num" style="color:${c}">${a.scores?.[k] ?? '—'} → ${b.scores?.[k] ?? '—'}</span></div>`).join('')}</div></div>` : ''}
      <div class="thumbs mt">${list.slice().reverse().map((s) => `<div><button class="thumb ${cmp.includes(s.id) ? 'sel' : ''}" data-act="pick" data-id="${s.id}" style="width:100%" aria-pressed="${cmp.includes(s.id)}"><img src="${s.img}" alt="Scan ${s.date}"><div><b>${fmtShort(s.date)}</b><br><span class="muted">${labels.slice(0, 2).map(([k, t]) => `${t.split(' ')[0]} ${s.scores?.[k] ?? '—'}`).join(' · ')}</span></div></button><button class="btn sm ghost" style="width:100%;margin-top:4px" data-act="delScan" data-id="${s.id}">Delete</button></div>`).join('') || '<p class="muted">No scans yet.</p>'}</div>
    </div>`;
  };
  async function runScan(file) {
    if (!file || !file.type.startsWith('image/')) return toast('Please choose an image file');
    let img; try { img = await loadImage(file); } catch { return toast('That image could not be opened'); }
    const cv = $('#scanCanvas'), W = Math.min(520, img.width), H = Math.round((img.height / img.width) * W);
    cv.width = W; cv.height = H; const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0, W, H);
    $('#scanBox').classList.remove('hidden'); $('#scanBox').classList.add('busy'); $('#drop').classList.add('hidden');
    await new Promise((r) => setTimeout(r, 1000));
    const res = scanKind === 'skin' ? analyzeSkin(ctx, W, H) : analyzeHair(ctx, W, H);
    $('#scanBox').classList.remove('busy');
    if (!res.scores) {
      $('#scanResult').innerHTML = `<h3>Couldn't read this photo</h3><p class="muted">${scanKind === 'skin' ? 'Not enough skin was found. Try a closer, evenly lit, front-facing photo.' : 'Could not separate hair from scalp. Try a sharper photo of your parting in bright light.'}</p><button class="btn" data-act="rescan">Try another photo</button>`;
      return;
    }
    lastScan = { ...res, base: ctx.getImageData(0, 0, W, H), W, H, thumb: toThumb(cv) };
    $('#overlayCtl').classList.remove('hidden');
    const prev = db.scans.filter((s) => s.kind === scanKind).sort((a, b) => b.date.localeCompare(a.date))[0];
    $('#scanResult').innerHTML = `<h3>Result</h3><div class="grid" style="grid-template-columns:repeat(2,minmax(0,1fr));gap:14px">${SCAN_LABELS[scanKind].map(([k, t, c]) => `<div><div class="gauge" style="--v:${res.scores[k]};--c:${c}"><span>${res.scores[k]}</span></div><div class="small" style="text-align:center">${t}${prev?.scores?.[k] != null ? `<br><span class="tiny muted">last: ${prev.scores[k]}</span>` : ''}</div></div>`).join('')}</div>
      <div class="row mt"><button class="btn primary" data-act="saveScan">Save to history</button><button class="btn ghost" data-act="rescan">Discard</button></div>
      <p class="tiny muted mt" style="margin-bottom:0">${scanKind === 'hair' ? 'Lower "scalp visible" over the weeks means denser coverage.' : 'Compare with earlier scans taken in the same light.'}</p>`;
  }
  function overlay(k) {
    if (!lastScan) return; const ctx = $('#scanCanvas').getContext('2d'); ctx.putImageData(lastScan.base, 0, 0);
    $$('#overlayCtl .chip').forEach((c) => c.classList.toggle('on', c.dataset.v === k));
    if (k === 'none') return;
    const m = lastScan.masks[k], col = { shine: [255, 194, 75], red: [255, 60, 90], spots: [255, 79, 216], scalp: [60, 240, 255], flakes: [255, 79, 216] }[k];
    const im = ctx.getImageData(0, 0, lastScan.W, lastScan.H);
    for (let i = 0; i < m.length; i++) if (m[i]) { im.data[i * 4] = col[0]; im.data[i * 4 + 1] = col[1]; im.data[i * 4 + 2] = col[2]; }
    ctx.putImageData(im, 0, 0);
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
      <form class="card" data-form="body"><h3>Your details</h3>
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
      case 'scanKind': scanKind = d.v; cmp = []; lastScan = null; return render();
      case 'overlay': return overlay(d.v);
      case 'rescan': lastScan = null; return render();
      case 'saveScan':
        if (!lastScan) return;
        db.scans.push({ id: uid(), date: today(), kind: scanKind, img: lastScan.thumb, scores: lastScan.scores });
        if (save()) toast('Scan saved to history'); lastScan = null; return render();
      case 'pick': {
        cmp = cmp.includes(d.id) ? cmp.filter((x) => x !== d.id) : [...cmp, d.id].slice(-2);
        const dt = (id) => db.scans.find((s) => s.id === id)?.date || '';
        cmp.sort((x, y) => dt(x).localeCompare(dt(y))); return render();
      }
      case 'cmpClear': cmp = []; return render();
      case 'delScan': return askConfirm('Delete this scan photo?', () => { db.scans = db.scans.filter((s) => s.id !== d.id); cmp = cmp.filter((x) => x !== d.id); save(); render(); });
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
    const fi = $('#scanFile');
    if (fi) {
      const drop = $('#drop');
      fi.addEventListener('change', () => runScan(fi.files[0]));
      ['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
      ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
      drop.addEventListener('drop', (e) => { e.preventDefault(); runScan(e.dataTransfer.files[0]); });
    }
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
