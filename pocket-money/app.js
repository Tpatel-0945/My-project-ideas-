/* Pocket Money — private personal expense manager.
 * Everything runs in the browser; data is kept in localStorage on this device. */
(function () {
  'use strict';

  // ---------- Config ----------
  // SHA-256 of the PIN. The PIN itself is never stored in the code.
  const PIN_HASH = 'f0ecb717168951785022e47f15a7f73dda21056fe9922f43b1fc0b4398e384c3';
  const MAX_ATTEMPTS = 5;
  const LOCKOUT_MS = 30 * 1000;
  const IDLE_LOCK_MS = 5 * 60 * 1000;
  const STORE_KEY = 'pocketMoney.v1';
  const GUARD_KEY = 'pocketMoney.guard';

  // weight = how easy a category is to cut back on (0 = essential, 1 = fully optional)
  const CATEGORIES = [
    { id: 'food', name: 'Food & Snacks', icon: '🍔', color: '#f59f00', weight: 0.6 },
    { id: 'stationery', name: 'Stationery & Books', icon: '✏️', color: '#4c6ef5', weight: 0.2 },
    { id: 'transport', name: 'Transport', icon: '🚌', color: '#12b886', weight: 0.3 },
    { id: 'shopping', name: 'Shopping & Articles', icon: '🛍️', color: '#e64980', weight: 1 },
    { id: 'entertainment', name: 'Entertainment', icon: '🎮', color: '#7950f2', weight: 1 },
    { id: 'recharge', name: 'Mobile & Internet', icon: '📱', color: '#15aabf', weight: 0.3 },
    { id: 'gifts', name: 'Gifts & Treats', icon: '🎁', color: '#fd7e14', weight: 0.8 },
    { id: 'health', name: 'Health', icon: '💊', color: '#40c057', weight: 0 },
    { id: 'other', name: 'Other', icon: '📦', color: '#868e96', weight: 0.6 }
  ];
  const CAT = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

  // ---------- Helpers ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sum = arr => arr.reduce((a, e) => a + e.amount, 0);
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

  function sha256(str) {
    const isPrime = n => { for (let i = 2; i * i <= n; i++) if (n % i === 0) return false; return true; };
    const frac = x => ((x - Math.floor(x)) * 4294967296) | 0;
    const H = [], K = [];
    for (let n = 2, c = 0; c < 64; n++) {
      if (!isPrime(n)) continue;
      if (c < 8) H[c] = frac(Math.pow(n, 1 / 2));
      K[c++] = frac(Math.pow(n, 1 / 3));
    }
    const bytes = new TextEncoder().encode(str);
    const len = bytes.length;
    const total = ((len + 9 + 63) >> 6) << 6;
    const buf = new Uint8Array(total);
    buf.set(bytes);
    buf[len] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(total - 8, Math.floor((len * 8) / 4294967296));
    dv.setUint32(total - 4, (len * 8) >>> 0);
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    const W = new Array(64);
    for (let off = 0; off < total; off += 64) {
      for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4);
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
        const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
        const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
  }

  // Dates are handled as local calendar days, stored as 'YYYY-MM-DD'.
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const today = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
  const daysBetween = (a, b) => Math.round((b - a) / 86400000);
  const daysInMonth = d => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const monthStart = d => new Date(d.getFullYear(), d.getMonth(), 1);
  const weekStart = d => addDays(d, -((d.getDay() + 6) % 7)); // Monday
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const fmtDate = d => `${DOW[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;

  // ---------- Data ----------
  // Two storage modes:
  //  - cloud: when hosted on claude.ai, data lives in a private per-user store
  //    (only the signed-in owner of that data can read it) and syncs across devices.
  //  - local: anywhere else, data lives in this browser's localStorage.
  // Cloud layout: collection data/users/<uid> with one doc "settings" and one doc per month "m-YYYY-MM".
  const DEFAULT_SETTINGS = { budget: 0, goal: 0, currency: '₹' };
  const cloud = { db: null, uid: null, queues: {} };
  let state = loadLocal();

  function loadLocal() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY));
      if (raw && Array.isArray(raw.expenses)) {
        return { expenses: raw.expenses, settings: Object.assign({}, DEFAULT_SETTINGS, raw.settings) };
      }
    } catch (e) { /* fall through to fresh state */ }
    return { expenses: [], settings: Object.assign({}, DEFAULT_SETTINGS) };
  }

  // Persist after a change. `months` lists the 'YYYY-MM' months whose expenses changed.
  function save(months, settingsChanged) {
    if (!cloud.db) {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
      catch (e) { toast('Could not save. Your browser storage may be full or turned off.', true); }
      return;
    }
    const col = cloud.db.collection('data/users/' + cloud.uid);
    [...new Set(months || [])].forEach(m => {
      const items = state.expenses.filter(e => e.date.startsWith(m));
      queueWrite('m-' + m, () => items.length ? col.doc('m-' + m).set({ month: m, items }) : col.doc('m-' + m).delete());
    });
    if (settingsChanged) queueWrite('settings', () => col.doc('settings').set(Object.assign({}, state.settings)));
  }
  // One write at a time per document; a later write to the same doc waits for the earlier one.
  function queueWrite(id, fn) {
    const run = () => fn().catch(err => {
      if (err && err.code === 'unavailable') return new Promise(r => setTimeout(r, 800 + Math.random() * 800)).then(fn);
      throw err;
    }).catch(err => {
      toast(err && err.code === 'quota_exceeded' ? 'Storage is full. Delete old expenses and try again.' : 'Could not sync your last change. Check your connection.', true);
    });
    cloud.queues[id] = (cloud.queues[id] || Promise.resolve()).then(run);
  }
  const allMonths = () => [...new Set(state.expenses.map(e => e.date.slice(0, 7)))];

  async function initCloud() {
    if (!window.claude || typeof window.claude.use !== 'function') return;
    try {
      const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
      const uid = db && user ? await user.id() : null;
      if (!db || !uid) return;
      cloud.db = db; cloud.uid = uid;
      setSyncStatus('Connecting…');
      db.collection('data/users/' + uid).onSnapshot(snap => {
        const next = { expenses: [], settings: Object.assign({}, DEFAULT_SETTINGS) };
        snap.docs.forEach(d => {
          const body = d.data() || {};
          if (d.id === 'settings') Object.assign(next.settings, body);
          else if (d.id.startsWith('m-') && Array.isArray(body.items)) next.expenses.push(...body.items);
        });
        state = next;
        setSyncStatus(snap.metadata.fromCache ? 'Connecting…' : 'Synced to your account');
        if (!$('#app').hidden) render();
      }, () => { setSyncStatus('Sync paused. Reload to reconnect.'); });
    } catch (e) { /* stay in local mode */ }
  }
  function setSyncStatus(text) {
    $('#sync-status').textContent = text;
    $('#storage-note').textContent = cloud.db
      ? 'Your expenses are saved privately to your Claude account, so you see the same data on your phone and laptop. Nobody else who opens this page can read them.'
      : 'Your expenses are saved only in this browser on this device. Download a backup now and then so you never lose them.';
  }

  // ---------- Toast & confirm (in-page; browser pop-ups are blocked when hosted) ----------
  let toastTimer = null;
  function toast(msg, bad) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('bad', !!bad);
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
  }
  function ask(message, okLabel) {
    return new Promise(resolve => {
      const dlg = $('#confirm');
      $('#confirm-msg').textContent = message;
      $('#confirm-ok').textContent = okLabel || 'Confirm';
      dlg.hidden = false;
      $('#confirm-ok').focus();
      const done = v => { dlg.hidden = true; $('#confirm-ok').onclick = $('#confirm-cancel').onclick = null; resolve(v); };
      $('#confirm-ok').onclick = () => done(true);
      $('#confirm-cancel').onclick = () => done(false);
    });
  }

  const money = (n, dp) => {
    const d = dp == null ? (Math.abs(n) >= 100 ? 0 : 2) : dp;
    const v = Math.round(n * Math.pow(10, d)) / Math.pow(10, d);
    return state.settings.currency + v.toLocaleString(undefined, { minimumFractionDigits: v % 1 ? d : 0, maximumFractionDigits: d });
  };
  const inRange = (from, to) => { // inclusive Date range
    const a = iso(from), b = iso(to);
    return state.expenses.filter(e => e.date >= a && e.date <= b);
  };
  const byCategory = list => {
    const m = {};
    list.forEach(e => { m[e.category] = (m[e.category] || 0) + e.amount; });
    return m;
  };

  // ---------- Lock ----------
  let idleTimer = null;

  function guard() { try { return JSON.parse(localStorage.getItem(GUARD_KEY)) || { fails: 0, until: 0 }; } catch (e) { return { fails: 0, until: 0 }; } }
  function setGuard(g) { try { localStorage.setItem(GUARD_KEY, JSON.stringify(g)); } catch (e) { /* ignore */ } }

  function showLock() {
    $('#app').hidden = true;
    $('#lock').hidden = false;
    $('#pin').value = '';
    $('#lock-error').textContent = '';
    updateDots();
    $('#pin').focus();
    clearTimeout(idleTimer);
    applyLockout();
  }
  function unlock() {
    $('#lock').hidden = true;
    $('#app').hidden = false;
    resetIdle();
    render();
  }
  function updateDots() {
    const n = $('#pin').value.length;
    $$('.pin-dots span').forEach((s, i) => s.classList.toggle('on', i < n));
  }
  let lockTicker = null;
  // While locked out, disable the PIN box and count down; re-enable when the time is up.
  function applyLockout() {
    clearInterval(lockTicker);
    const tick = () => {
      const left = guard().until - Date.now();
      const locked = left > 0;
      $('#pin').disabled = locked;
      $('#unlock-btn').disabled = locked;
      if (locked) {
        $('#lock-error').textContent = `Too many wrong tries. Try again in ${Math.ceil(left / 1000)} s.`;
      } else {
        clearInterval(lockTicker);
        if ($('#lock-error').textContent.startsWith('Too many')) $('#lock-error').textContent = '';
        $('#pin').focus();
      }
    };
    tick();
    if (guard().until > Date.now()) lockTicker = setInterval(tick, 500);
  }
  function tryPin() {
    const g = guard();
    const err = $('#lock-error');
    if (Date.now() < g.until) { applyLockout(); return; }
    const pin = $('#pin').value;
    // Bug fix: an empty or partial PIN used to count as a wrong attempt, so tapping
    // Unlock a few times locked the app and then rejected even the correct PIN.
    if (pin.length < 4) {
      err.textContent = 'Enter all 4 digits of your PIN.';
      $('#pin').focus();
      return;
    }
    if (sha256(pin) === PIN_HASH) {
      setGuard({ fails: 0, until: 0 });
      err.textContent = '';
      unlock();
      return;
    }
    g.fails += 1;
    if (g.fails >= MAX_ATTEMPTS) { g.until = Date.now() + LOCKOUT_MS; g.fails = 0; }
    setGuard(g);
    if (g.until > Date.now()) applyLockout();
    else err.textContent = `That PIN is wrong. ${MAX_ATTEMPTS - g.fails} ${MAX_ATTEMPTS - g.fails === 1 ? 'try' : 'tries'} left.`;
    const card = $('#lock-form');
    card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
    $('#pin').value = '';
    updateDots();
  }
  function resetIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(showLock, IDLE_LOCK_MS);
  }

  $('#pin').addEventListener('input', e => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
    updateDots();
    if (e.target.value.length === 4) tryPin();
  });
  $('#lock-form').addEventListener('submit', e => { e.preventDefault(); tryPin(); });
  $('#lock-btn').addEventListener('click', showLock);
  ['click', 'keydown', 'touchstart', 'scroll'].forEach(ev => document.addEventListener(ev, () => { if (!$('#app').hidden) resetIdle(); }, { passive: true }));

  // ---------- Navigation ----------
  let view = 'overview';
  let period = 'month';

  function go(v) {
    view = v;
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === v));
    $$('.view').forEach(s => { s.hidden = s.id !== 'view-' + v; });
    if (v === 'add' && !$('#f-id').value) resetForm();
    render();
    window.scrollTo(0, 0);
  }
  $$('.tab').forEach(t => t.addEventListener('click', () => go(t.dataset.view)));
  document.addEventListener('click', e => {
    const g = e.target.closest('[data-goto]');
    if (g) go(g.dataset.goto);
  });
  $$('.segmented button').forEach(b => b.addEventListener('click', () => {
    period = b.dataset.period;
    $$('.segmented button').forEach(x => x.classList.toggle('active', x === b));
    renderOverview();
  }));

  function render() {
    $$('.logo').forEach(l => { l.textContent = state.settings.currency; });
    $('.amount-input .cur').textContent = state.settings.currency;
    if (view === 'overview') renderOverview();
    if (view === 'history') renderHistory();
    if (view === 'insights') renderInsights();
    if (view === 'settings') renderSettings();
  }

  // ---------- Period stats ----------
  function periodInfo(kind) {
    const t = today();
    const budget = +state.settings.budget || 0;
    const target = Math.max(0, budget - (+state.settings.goal || 0)); // what you can spend if you still hit the savings goal
    let start, end, prevStart, label;
    if (kind === 'week') {
      start = weekStart(t); end = addDays(start, 6); prevStart = addDays(start, -7);
      label = `${fmtDate(start)} – ${fmtDate(end)}`;
    } else {
      start = monthStart(t); end = new Date(t.getFullYear(), t.getMonth() + 1, 0);
      prevStart = new Date(t.getFullYear(), t.getMonth() - 1, 1);
      label = `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][t.getMonth()]} ${t.getFullYear()}`;
    }
    const length = daysBetween(start, end) + 1;
    const elapsed = daysBetween(start, t) + 1;
    const list = inRange(start, end);
    const spent = sum(list);
    // Same number of days into the previous period, for a fair comparison
    const prevLen = kind === 'week' ? 7 : daysInMonth(prevStart);
    const prevSame = sum(inRange(prevStart, addDays(prevStart, Math.min(elapsed, prevLen) - 1)));
    const prevFull = sum(inRange(prevStart, addDays(prevStart, prevLen - 1)));
    const allowance = kind === 'week' ? (target * 7) / daysInMonth(t) : target;
    const projected = elapsed > 0 ? (spent / elapsed) * length : spent;
    return { kind, start, end, length, elapsed, list, spent, prevSame, prevFull, budget, target, allowance, projected, label };
  }

  // ---------- Overview ----------
  function renderOverview() {
    const p = periodInfo(period);
    const word = period === 'week' ? 'week' : 'month';
    $('#period-label').textContent = p.label;

    const change = p.prevSame ? Math.round(((p.spent - p.prevSame) / p.prevSame) * 100) : null;
    const changeHtml = change === null ? `No data for last ${word} yet`
      : `<span class="${change > 0 ? 'up' : 'down'}">${change > 0 ? '▲' : '▼'} ${Math.abs(change)}%</span> vs same point last ${word}`;
    const left = p.allowance - p.spent;
    const daysLeft = p.length - p.elapsed + 1;
    const used = pct(p.spent, p.allowance);
    const meterCls = used >= 100 ? 'bad' : used > pct(p.elapsed, p.length) ? 'warn' : '';

    const cards = [
      { label: `Spent this ${word}`, value: money(p.spent), sub: changeHtml },
      p.allowance > 0
        ? { label: `Left of ${word}ly limit`, value: `<span class="${left < 0 ? 'up' : ''}">${money(left)}</span>`,
            sub: `${used}% of ${money(p.allowance)} used<div class="meter"><i class="${meterCls}" style="width:${Math.min(100, used)}%"></i></div>` }
        : { label: 'Budget', value: '—', sub: '<button class="link" data-goto="settings">Set your monthly pocket money</button>' },
      p.allowance > 0
        ? { label: 'Safe to spend per day', value: money(Math.max(0, left) / daysLeft), sub: `for the next ${daysLeft} day${daysLeft > 1 ? 's' : ''} (incl. today)` }
        : { label: 'Daily average', value: money(p.spent / p.elapsed), sub: `over ${p.elapsed} day${p.elapsed > 1 ? 's' : ''}` },
      { label: `Projected ${word} total`, value: money(p.projected),
        sub: p.allowance > 0
          ? (p.projected > p.allowance ? `<span class="up">over limit by ${money(p.projected - p.allowance)}</span>` : `<span class="down">under limit by ${money(p.allowance - p.projected)}</span>`)
          : `at ${money(p.spent / p.elapsed)} per day` }
    ];
    $('#kpis').innerHTML = cards.map(c => `<div class="kpi"><div class="label">${c.label}</div><div class="value">${c.value}</div><div class="sub">${c.sub}</div></div>`).join('');

    renderDonut(byCategory(p.list), p.spent);

    // Daily bars
    const days = [];
    const t = iso(today());
    for (let i = 0; i < p.length; i++) {
      const d = addDays(p.start, i);
      const k = iso(d);
      days.push({ d, k, v: sum(state.expenses.filter(e => e.date === k)), today: k === t });
    }
    const dailyLimit = p.target > 0 ? p.target / daysInMonth(today()) : 0;
    $('#daily-title').textContent = period === 'week' ? 'Spending by day' : 'Daily spending this month';
    bars('#daily-bars', days.map(x => ({
      v: x.v,
      label: period === 'week' ? DOW[x.d.getDay()] : (x.d.getDate() % 5 === 1 || p.length <= 7 ? String(x.d.getDate()) : ''),
      tip: `${fmtDate(x.d)}: ${money(x.v)}`,
      cls: (x.today ? 'today ' : '') + (dailyLimit && x.v > dailyLimit ? 'over' : '')
    })), dailyLimit);

    // 6-month bars
    const months = [];
    const now = today();
    for (let i = 5; i >= 0; i--) {
      const s = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const v = sum(inRange(s, new Date(s.getFullYear(), s.getMonth() + 1, 0)));
      months.push({ v, label: MONTHS[s.getMonth()], tip: `${MONTHS[s.getMonth()]} ${s.getFullYear()}: ${money(v)}`, cls: (i === 0 ? 'current ' : '') + (p.target && v > p.target ? 'over' : '') });
    }
    bars('#month-bars', months, p.target);

    // Recent
    const recent = [...state.expenses].sort(sortDesc).slice(0, 6);
    $('#recent').innerHTML = recent.length ? recent.map(e => txItem(e, false)).join('') : '<li class="empty">No expenses yet. <button class="link" data-goto="add">Add your first one</button></li>';
  }

  function renderDonut(cats, total) {
    const entries = Object.entries(cats).sort((a, b) => b[1] - a[1]);
    const R = 70, C = 2 * Math.PI * R;
    let off = 0;
    const arcs = entries.map(([id, v]) => {
      const len = (v / total) * C;
      const s = `<circle r="${R}" cx="90" cy="90" fill="none" stroke="${CAT[id] ? CAT[id].color : '#999'}" stroke-width="22"
        stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 90 90)"><title>${esc(CAT[id] ? CAT[id].name : id)}: ${money(v)}</title></circle>`;
      off += len;
      return s;
    }).join('');
    $('#donut').innerHTML = `<svg viewBox="0 0 180 180" width="180" height="180" role="img" aria-label="Spending by category">
      <circle r="${R}" cx="90" cy="90" fill="none" stroke="var(--surface-2)" stroke-width="22"/>${total ? arcs : ''}
      <text x="90" y="84" text-anchor="middle" class="donut-center">Total</text>
      <text x="90" y="108" text-anchor="middle" class="donut-total">${esc(money(total, 0))}</text></svg>`;
    $('#cat-legend').innerHTML = entries.length ? entries.map(([id, v]) => {
      const c = CAT[id] || { name: id, color: '#999', icon: '' };
      return `<li><span class="sw" style="background:${c.color}"></span>${c.icon} ${esc(c.name)}<span class="amt">${money(v)}</span><span class="pct">${pct(v, total)}%</span></li>`;
    }).join('') : '<li class="muted">Nothing spent in this period yet.</li>';
  }

  function bars(sel, items, limit) {
    const max = Math.max(limit || 0, ...items.map(i => i.v));
    const el = $(sel);
    if (!max) { el.innerHTML = '<div class="empty">No spending to show yet.</div>'; return; }
    el.innerHTML = items.map(i => `<div class="bar" data-tip="${esc(i.tip)}"><i class="${i.cls || ''}${i.v ? '' : ' zero'}" style="height:${(i.v / max) * 100}%"></i><span>${esc(i.label)}</span></div>`).join('');
  }

  // ---------- Transactions ----------
  const sortDesc = (a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt);
  function txItem(e, actions) {
    const c = CAT[e.category] || CAT.other;
    return `<li>
      <div class="tx-ico" style="background:${c.color}22">${c.icon}</div>
      <div class="tx-main"><b>${esc(e.note || c.name)}</b><small>${esc(c.name)} · ${fmtDate(parse(e.date))}</small></div>
      <div class="tx-amt">${money(e.amount)}</div>
      ${actions ? `<div class="tx-actions"><button class="icon-btn" data-edit="${e.id}" title="Edit">Edit</button><button class="icon-btn" data-del="${e.id}" title="Delete">Delete</button></div>` : ''}
    </li>`;
  }

  // ---------- Add / edit form ----------
  let chosenCat = 'food';
  $('#f-cats').innerHTML = CATEGORIES.map(c => `<button type="button" data-cat="${c.id}"><span>${c.icon}</span>${esc(c.name)}</button>`).join('');
  $$('#f-cats button').forEach(b => b.addEventListener('click', () => pickCat(b.dataset.cat)));
  function pickCat(id) {
    chosenCat = id;
    $$('#f-cats button').forEach(b => b.classList.toggle('active', b.dataset.cat === id));
  }
  function resetForm() {
    $('#f-id').value = '';
    $('#f-amount').value = '';
    $('#f-note').value = '';
    $('#f-date').value = iso(today());
    $('#form-title').textContent = 'Add expense';
    $('#f-cancel').hidden = true;
    pickCat(chosenCat);
  }
  function editExpense(id) {
    const e = state.expenses.find(x => x.id === id);
    if (!e) return;
    go('add');
    $('#f-id').value = e.id;
    $('#f-amount').value = e.amount;
    $('#f-note').value = e.note || '';
    $('#f-date').value = e.date;
    pickCat(e.category);
    $('#form-title').textContent = 'Edit expense';
    $('#f-cancel').hidden = false;
    $('#form-msg').textContent = '';
  }
  $('#f-cancel').addEventListener('click', () => { resetForm(); go('history'); });
  $('#expense-form').addEventListener('submit', ev => {
    ev.preventDefault();
    const amount = Math.round(parseFloat($('#f-amount').value) * 100) / 100;
    if (!(amount > 0)) { $('#form-msg').textContent = ''; $('#f-amount').focus(); return; }
    const data = { amount, category: chosenCat, note: $('#f-note').value.trim(), date: $('#f-date').value || iso(today()) };
    const id = $('#f-id').value;
    if (id) {
      const e = state.expenses.find(x => x.id === id);
      const oldMonth = e ? e.date.slice(0, 7) : null;
      if (e) Object.assign(e, data);
      save([oldMonth, data.date.slice(0, 7)].filter(Boolean));
      resetForm();
      go('history');
      return;
    }
    state.expenses.push(Object.assign({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), createdAt: new Date().toISOString() }, data));
    save([data.date.slice(0, 7)]);
    $('#form-msg').textContent = `Saved ${money(amount)} on ${CAT[chosenCat].name}.`;
    const keepDate = $('#f-date').value;
    resetForm();
    $('#f-date').value = keepDate;
    $('#f-amount').focus();
  });

  // ---------- History ----------
  $('#h-cat').innerHTML += CATEGORIES.map(c => `<option value="${c.id}">${c.icon} ${esc(c.name)}</option>`).join('');
  $('#h-month').value = iso(today()).slice(0, 7);
  ['input', 'change'].forEach(ev => ['#h-search', '#h-cat', '#h-month'].forEach(s => $(s).addEventListener(ev, renderHistory)));
  $('#h-list').addEventListener('click', e => {
    const ed = e.target.closest('[data-edit]');
    const del = e.target.closest('[data-del]');
    if (ed) editExpense(ed.dataset.edit);
    if (del) {
      const target = state.expenses.find(x => x.id === del.dataset.del);
      if (!target) return;
      ask(`Delete ${money(target.amount)} on ${(CAT[target.category] || CAT.other).name}?`, 'Delete').then(ok => {
        if (!ok) return;
        state.expenses = state.expenses.filter(x => x.id !== target.id);
        save([target.date.slice(0, 7)]);
        renderHistory();
        toast('Expense deleted.');
      });
    }
  });

  function renderHistory() {
    const q = $('#h-search').value.trim().toLowerCase();
    const cat = $('#h-cat').value;
    const mon = $('#h-month').value;
    const list = state.expenses.filter(e =>
      (!cat || e.category === cat) && (!mon || e.date.startsWith(mon)) &&
      (!q || (e.note || '').toLowerCase().includes(q) || (CAT[e.category] || CAT.other).name.toLowerCase().includes(q))
    ).sort(sortDesc);
    $('#h-summary').textContent = `${list.length} expense${list.length === 1 ? '' : 's'} · total ${money(sum(list))}`;
    let html = '', last = '';
    list.forEach(e => {
      if (e.date !== last) {
        const dayTotal = sum(list.filter(x => x.date === e.date));
        html += `<li class="day-head">${fmtDate(parse(e.date))} · ${money(dayTotal)}</li>`;
        last = e.date;
      }
      html += txItem(e, true);
    });
    $('#h-list').innerHTML = html || '<li class="empty">No expenses match these filters.</li>';
  }

  // ---------- Insights ----------
  function renderInsights() {
    const m = periodInfo('month');
    const w = periodInfo('week');
    const out = [];
    const add = (type, icon, title, text) => out.push({ type, icon, title, text });
    const daysLeft = m.length - m.elapsed + 1;
    const dailyAvg = m.spent / m.elapsed;
    const catsNow = byCategory(m.list);
    const goal = +state.settings.goal || 0;

    if (!state.expenses.length) {
      add('info', '👋', 'Start tracking', 'Add each expense as you make it. After a few days you will see where your money goes and get tips to save more.');
    }
    if (!m.budget) {
      add('info', '🎯', 'Set your monthly pocket money', 'Enter your monthly budget (and an optional savings goal) in Settings to unlock daily limits, overspending alerts and a savings plan.');
    } else if (m.spent > 0) {
      const timePct = pct(m.elapsed, m.length);
      const usedPct = pct(m.spent, m.target);
      if (m.spent >= m.target) {
        add('bad', '🚨', 'Monthly limit already used',
          `You have spent ${money(m.spent)}, which is ${money(m.spent - m.target)} over your limit of ${money(m.target)}${goal ? ` (budget minus your ${money(goal)} savings goal)` : ''}. Try a no-spend period for the remaining ${daysLeft} day${daysLeft > 1 ? 's' : ''} — only essentials.`);
      } else if (m.projected > m.target) {
        const safe = (m.target - m.spent) / daysLeft;
        const cutPct = Math.round((1 - safe / dailyAvg) * 100);
        add('bad', '📈', 'On track to overspend',
          `At ${money(dailyAvg)}/day you will spend about ${money(m.projected)} this month — ${money(m.projected - m.target)} over your limit. Bring daily spending down to ${money(safe)} (about ${cutPct}% less) for the next ${daysLeft} days to stay on track.`);
      } else {
        const saving = m.budget - m.projected;
        add('good', '✅', 'You are on track',
          `${usedPct}% of your limit used with ${timePct}% of the month gone. At this pace you'll finish around ${money(m.projected)} and keep about ${money(saving)} of your pocket money${goal ? ` — your ${money(goal)} goal is safe` : ''}.`);
      }
    }

    const top = Object.entries(catsNow).sort((a, b) => b[1] - a[1]);
    if (top.length && m.spent > 0) {
      const [id, v] = top[0];
      const share = pct(v, m.spent);
      const c = CAT[id] || CAT.other;
      if (share >= 35 && top.length > 1) {
        const cut = v * 0.25 * (m.length / m.elapsed);
        add('warn', c.icon, `${c.name} is ${share}% of your spending`,
          `This is your biggest money drain this month (${money(v)}). Cutting it by a quarter would save roughly ${money(cut)} over the month.`);
      } else {
        add('info', c.icon, `Biggest category: ${c.name}`, `${money(v)} so far this month (${share}% of spending).`);
      }
    }

    // Category growth vs the same point last month
    const t = today();
    const prevStart = new Date(t.getFullYear(), t.getMonth() - 1, 1);
    const prevSameList = inRange(prevStart, addDays(prevStart, Math.min(m.elapsed, daysInMonth(prevStart)) - 1));
    const catsPrev = byCategory(prevSameList);
    const threshold = m.budget ? m.budget * 0.05 : dailyAvg;
    Object.entries(catsNow).forEach(([id, v]) => {
      const before = catsPrev[id] || 0;
      if (before > 0 && v > before * 1.3 && v - before >= threshold) {
        const c = CAT[id] || CAT.other;
        add('warn', '⬆️', `${c.name} is up ${Math.round(((v - before) / before) * 100)}%`,
          `${money(v)} so far vs ${money(before)} by this day last month. Check what changed and whether you can return to last month's level.`);
      }
    });

    // Week vs last week
    if (w.prevSame > 0 && w.spent > 0) {
      const diff = Math.round(((w.spent - w.prevSame) / w.prevSame) * 100);
      if (diff >= 20) add('warn', '📅', `This week is ${diff}% higher`, `${money(w.spent)} so far vs ${money(w.prevSame)} at the same point last week.`);
      else if (diff <= -10) add('good', '📉', `This week is ${Math.abs(diff)}% lower`, `Nice — ${money(w.spent)} so far vs ${money(w.prevSame)} at the same point last week. Keep it going.`);
    }

    // Small purchases that add up
    if (m.list.length >= 6) {
      const avg = m.spent / m.list.length;
      const small = m.list.filter(e => e.amount <= avg * 0.5);
      const smallTotal = sum(small);
      if (small.length >= 5 && smallTotal >= m.spent * 0.15) {
        add('warn', '🪙', 'Small buys are adding up',
          `${small.length} small purchases this month total ${money(smallTotal)} (${pct(smallTotal, m.spent)}% of your spending). Skipping half of them would save about ${money(smallTotal / 2)}.`);
      }
    }

    // Weekend vs weekday over the last 4 weeks
    const last28 = inRange(addDays(t, -27), t);
    if (last28.length >= 8) {
      const we = sum(last28.filter(e => [0, 6].includes(parse(e.date).getDay()))) / 8;
      const wd = sum(last28.filter(e => ![0, 6].includes(parse(e.date).getDay()))) / 20;
      if (wd > 0 && we > wd * 1.5) {
        add('info', '🗓️', 'You spend more on weekends',
          `About ${money(we)} per weekend day vs ${money(wd)} on weekdays. Planning weekend outings in advance is an easy way to save.`);
      }
    }

    // Trend vs the last 3 months
    const prevMonths = [1, 2, 3].map(i => {
      const s = new Date(t.getFullYear(), t.getMonth() - i, 1);
      return sum(inRange(s, new Date(s.getFullYear(), s.getMonth() + 1, 0)));
    }).filter(v => v > 0);
    if (prevMonths.length >= 2 && m.elapsed >= 7) {
      const avg = prevMonths.reduce((a, b) => a + b, 0) / prevMonths.length;
      if (m.projected > avg * 1.2) add('warn', '📊', 'Higher than your usual month', `You're heading for ${money(m.projected)} vs your recent average of ${money(avg)}.`);
      else if (m.projected < avg * 0.9) add('good', '🏆', 'Better than your usual month', `You're heading for ${money(m.projected)} vs your recent average of ${money(avg)}. Well done!`);
    }

    $('#insights').innerHTML = out.map(i => `<div class="insight ${i.type}"><div class="badge">${i.icon}</div><div><h4>${esc(i.title)}</h4><p>${esc(i.text)}</p></div></div>`).join('');
    renderPlan(m, catsNow);
  }

  function renderPlan(m, catsNow) {
    const body = $('#plan-body');
    const intro = $('#plan-intro');
    if (!m.spent) {
      intro.textContent = 'Add some expenses this month to get a personalised plan.';
      body.innerHTML = '';
      return;
    }
    const proj = {};
    Object.entries(catsNow).forEach(([id, v]) => { proj[id] = (v / m.elapsed) * m.length; });
    // Only the remaining days can still change, so cuts are limited to what is still to be spent.
    const remaining = {};
    Object.entries(catsNow).forEach(([id, v]) => { remaining[id] = proj[id] - v; });
    let need, reason;
    if (m.target && m.projected > m.target) {
      need = m.projected - m.target;
      reason = `You're on pace for ${money(m.projected)} against a limit of ${money(m.target)}. To close the ${money(need)} gap, here is how to share the cut across categories — easy-to-skip spending takes the biggest share.`;
    } else {
      need = m.projected * 0.1;
      reason = m.target
        ? `You're within your limit. Want to save even more? This plan trims about 10% (${money(need)}) from the rest of the month.`
        : `Set a budget in Settings for a precise plan. Meanwhile, here's how to save about 10% (${money(need)}) this month.`;
    }
    const weights = {};
    let wsum = 0;
    Object.keys(remaining).forEach(id => { const w = remaining[id] * (CAT[id] || CAT.other).weight; weights[id] = w; wsum += w; });
    const cuts = {};
    let planned = 0;
    Object.keys(remaining).forEach(id => {
      cuts[id] = wsum ? Math.min(remaining[id] * 0.6, (need * weights[id]) / wsum) : 0;
      planned += cuts[id];
    });
    const dim = m.length;
    const rows = Object.keys(catsNow).sort((a, b) => cuts[b] - cuts[a] || catsNow[b] - catsNow[a]).map(id => {
      const c = CAT[id] || CAT.other;
      const newWeekly = ((proj[id] - cuts[id]) / dim) * 7;
      return `<tr><td>${c.icon} ${esc(c.name)}</td><td>${money(catsNow[id])}</td><td>${money(proj[id])}</td>
        <td>${cuts[id] >= 1 ? `<span class="down">−${money(cuts[id], 0)}</span>` : '—'}</td><td>${money(newWeekly, 0)}</td></tr>`;
    }).join('');
    const short = need - planned;
    intro.textContent = reason + (short > 1 ? ` Even with these cuts you'd still be about ${money(short, 0)} over — consider pausing optional spending entirely until next month.` : '');
    body.innerHTML = rows;
  }

  // ---------- Settings ----------
  function renderSettings() {
    $('#s-budget').value = state.settings.budget || '';
    $('#s-goal').value = state.settings.goal || '';
    $('#s-currency').value = state.settings.currency;
    $('#settings-msg').textContent = '';
  }
  $('#settings-form').addEventListener('submit', e => {
    e.preventDefault();
    const budget = Math.max(0, parseFloat($('#s-budget').value) || 0);
    const goal = Math.max(0, parseFloat($('#s-goal').value) || 0);
    if (budget && goal >= budget) { $('#settings-msg').textContent = 'Savings goal must be smaller than your budget.'; return; }
    state.settings = { budget, goal, currency: $('#s-currency').value };
    save([], true);
    render();
    $('#settings-msg').textContent = 'Settings saved.';
  });
  $('#export').addEventListener('click', async () => {
    const filename = `pocket-money-backup-${iso(today())}.json`;
    const json = JSON.stringify(state, null, 2);
    const downloads = window.claude && typeof window.claude.use === 'function' ? await window.claude.use('downloads') : null;
    if (downloads) {
      try { await downloads.save({ filename, data: json }); toast('Backup saved.'); }
      catch (err) { if (err && err.code !== 'declined') toast('Could not save the backup here.', true); }
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('#import').addEventListener('change', e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const r = new FileReader();
    r.onload = async () => {
      let clean, data;
      try {
        data = JSON.parse(r.result);
        if (!Array.isArray(data.expenses)) throw new Error('bad file');
        clean = data.expenses.filter(x => x && x.id && x.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(x.date))
          .map(x => ({ id: String(x.id), amount: +x.amount, category: CAT[x.category] ? x.category : 'other', note: String(x.note || ''), date: x.date, createdAt: String(x.createdAt || '') }));
      } catch (err) { toast('That file is not a Pocket Money backup.', true); return; }
      if (!await ask(`Restore ${clean.length} expenses from this backup? It replaces everything saved now.`, 'Restore')) return;
      const before = allMonths();
      const s = data.settings || {};
      state = { expenses: clean, settings: { budget: +s.budget || 0, goal: +s.goal || 0, currency: typeof s.currency === 'string' ? s.currency.slice(0, 3) : '₹' } };
      save(before.concat(allMonths()), true);
      render();
      toast('Backup restored.');
    };
    r.readAsText(file);
  });
  $('#wipe').addEventListener('click', async () => {
    if (!await ask('Delete all expenses and settings? This cannot be undone. Download a backup first if you are unsure.', 'Delete everything')) return;
    const before = allMonths();
    state = { expenses: [], settings: Object.assign({}, DEFAULT_SETTINGS, { currency: state.settings.currency }) };
    save(before, true);
    render();
    toast('All data deleted.');
  });

  // ---------- Start ----------
  resetForm();
  setSyncStatus('Saved on this device');
  showLock();
  initCloud();
})();
