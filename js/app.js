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
  const fresh = () => ({ v: 1, profile: { name: '', skinType: 'Combination', hairType: 'Wavy' }, logs: {}, scans: [], routine: structuredClone(DEFAULT_ROUTINE), reminders: structuredClone(DEFAULT_REM), demo: false });
  const newLog = () => ({
    skin: { oil: 3, dry: 2, red: 1, sens: 1, breakouts: 0, zones: [] },
    hair: { fall: 70, itch: 1, flakes: 1, oil: 3, frizz: 3, wash: false },
    life: { sleep: 7, water: 6, stress: 4, sun: 30, junk: false, period: false, workout: false },
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
    water: { label: 'Water (glasses)', color: '#6bb8ff', get: (l) => l.life?.water, max: 12 },
    routine: { label: 'Routine done %', color: '#e9edff', get: (l) => { const a = adherence(l); return a == null ? null : Math.round(a * 100); }, max: 100 },
  };
  const series = (key, dates) => dates.map((d) => (db.logs[d] ? METRICS[key].get(db.logs[d]) ?? null : null));
  const avgOver = (key, n, end = today()) => avg(series(key, lastDays(n, end)));

  function streak() {
    let d = db.logs[today()] ? today() : addDays(today(), -1), n = 0;
    while (db.logs[d]) { n++; d = addDays(d, -1); }
    return n;
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
  ];
  const TARGETS = [['breakouts', 'breakouts'], ['fall', 'hair fall'], ['red', 'redness']];

  function correlations(n = 90) {
    const logs = lastDays(n).map((d) => db.logs[d]).filter(Boolean);
    const out = [];
    for (const f of FACTORS) for (const [k, name] of TARGETS) {
      const w = [], wo = [];
      logs.forEach((l) => { const v = METRICS[k].get(l); if (v == null) return; (f.test(l) ? w : wo).push(v); });
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
      const br = Math.max(0, Math.round(0.6 + (sleep < 6.5 ? 2 : 0) + (junk ? 1.6 : 0) + (period ? 2.4 : 0) + (stress >= 7 ? 1 : 0) + r() * 1.8 - t * 0.03));
      const zonePool = period ? ['chin', 'jawL', 'jawR'] : ['forehead', 'nose', 'cheekL', 'cheekR'];
      const zones = br ? zonePool.filter(() => r() < 0.55) : [];
      if (br && !zones.length) zones.push(zonePool[0]);
      d.logs[date] = {
        skin: { oil: Math.round(clamp(3 + (sun > 80 ? 1.5 : 0) + r() * 3, 0, 10)), dry: Math.round(r() * 3), red: Math.round(clamp(br * 0.7 + r() * 2, 0, 10)), sens: Math.round(r() * 3), breakouts: br, zones },
        hair: { fall: Math.round(clamp(118 - t * 1.1 + (stress >= 7 ? 28 : 0) + r() * 30, 30, 260)), itch: Math.round(r() * 3 + (t < 15 ? 2 : 0)), flakes: Math.round(r() * 3 + (t < 15 ? 2.5 : 0)), oil: Math.round(3 + r() * 4), frizz: Math.round(2 + r() * 5), wash: r() < 0.4 },
        life: { sleep, water, stress, sun, junk, period, workout },
        done: { am: d.routine.am.filter(() => r() < 0.88).map((s) => s.id), pm: d.routine.pm.filter(() => r() < (sleep < 6 ? 0.45 : 0.8)).map((s) => s.id) },
        flags: [], note: '',
      };
    }
    [42, 35, 28, 21, 14, 7, 0].forEach((ago, k) => {
      const date = addDays(end, -ago);
      const fc = demoFace(Math.max(0, 6 - k), 100 + k), fs = analyzeSkin(fc.getContext('2d'), 240, 240);
      d.scans.push({ id: 'ds' + k, date, kind: 'skin', img: fc.toDataURL('image/jpeg', 0.75), scores: fs.scores });
      const hc = demoHair(30 - k * 2.4, 60 - k * 8, 200 + k), hs = analyzeHair(hc.getContext('2d'), 240, 240);
      d.scans.push({ id: 'dh' + k, date, kind: 'hair', img: hc.toDataURL('image/jpeg', 0.75), scores: hs.scores });
    });
    d.demo = true;
  }
  function loadDb() {
    const saved = store.get('db', null);
    if (saved) return { ...fresh(), ...saved };
    const d = fresh(); seedDemo(d); store.set('db', d); return d;
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

    <div class="grid g4 section">${cards.map(([k, label, unit, cur, prev, dp]) => `
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
    const l = draft(), logged = !!db.logs[logDate];
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
        <label>Water (glasses)</label>
        <div class="water">${Array.from({ length: 12 }, (_, i) => `<button class="${i < l.life.water ? 'on' : ''}" data-act="water" data-v="${i + 1}" aria-label="${i + 1} glasses"></button>`).join('')}</div>
        <p class="tiny muted" style="margin:4px 0 14px"><span class="num">${l.life.water}</span> glasses</p>
        ${slider('life.stress', 'Stress', 0, 10, 1, '#ff9de2', ['Calm', 'Overwhelmed'])}
        ${slider('life.sun', 'Time in the sun', 0, 240, 10, '#ffc24b', null, ' min')}
        <div class="row">${toggle('life.junk', 'Junk / sugary food')}${toggle('life.period', 'On my period')}${toggle('life.workout', 'Worked out')}</div>
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
      case 'step': { const l = ensureLog(); setPath(l, d.path, clamp(getPath(l, d.path) + +d.d, 0, d.path === 'hair.fall' ? 500 : 50)); persist(); return render(); }
      case 'set': { const l = ensureLog(); setPath(l, d.path, +d.v); persist(); return render(); }
      case 'flip': { const l = ensureLog(); setPath(l, d.path, !getPath(l, d.path)); persist(); return render(); }
      case 'water': { const l = ensureLog(); l.life.water = l.life.water === +d.v ? +d.v - 1 : +d.v; persist(); return render(); }
      case 'zone': { const l = ensureLog(), z = l.skin.zones, i = z.indexOf(d.z); i >= 0 ? z.splice(i, 1) : z.push(d.z); if (z.length && !l.skin.breakouts) l.skin.breakouts = 1; persist(); return render(); }
      case 'flag': { const l = ensureLog(), i = l.flags.indexOf(d.id); i >= 0 ? l.flags.splice(i, 1) : l.flags.push(d.id); persist(); return render(); }
      case 'done': { const l = ensureLog(d.date), arr = l.done[d.w], i = arr.indexOf(d.id); i >= 0 ? arr.splice(i, 1) : arr.push(d.id); persist(); return render(); }
      case 'day': return go('#/log/' + addDays(logDate, +d.d));
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
  }
  document.addEventListener('DOMContentLoaded', init);

  return { go, render };
})();
