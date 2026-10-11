/* AURA//LAB — single-page app (hash router, no build step).
   All user data lives in localStorage under the "aura." prefix. */

const App = (() => {
  /* ================= helpers ================= */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const today = () => new Date().toISOString().slice(0, 10);

  const store = {
    get(k, d) { try { const v = localStorage.getItem('aura.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) {
      try { localStorage.setItem('aura.' + k, JSON.stringify(v)); return true; }
      catch { toast('Storage is full — delete some progress photos or export your data.'); return false; }
    },
    del(k) { try { localStorage.removeItem('aura.' + k); } catch {} },
  };

  const hash = (s) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  const ING = Object.fromEntries(INGREDIENTS.map((i) => [i.id, i]));
  const PROD = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
  const BUND = Object.fromEntries(BUNDLES.map((b) => [b.id, b]));
  const ALL_CONCERNS = [...CONCERNS.skin.map((c) => ({ ...c, area: 'skin' })), ...CONCERNS.hair.map((c) => ({ ...c, area: 'hair' }))];
  const concernById = (id) => ALL_CONCERNS.find((c) => c.id === id);

  let route = '/';
  const readHash = () => { try { return (location.hash.slice(1) || '/').split('?')[0]; } catch { return '/'; } };
  function go(h, push = true) {
    route = (h.replace(/^#/, '') || '/').split('?')[0];
    if (push) { try { history.pushState(null, '', '#' + route); } catch {} }
    render();
  }

  /* In-page dialog (replaces confirm/alert, which embedded viewers block) */
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

  let toastTimer;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  /* Keyword → ingredient detection (used by routine builder & chatbot) */
  const ALIASES = {
    'bha': 'salicylic-acid', 'salicylic': 'salicylic-acid', 'aha': 'glycolic-acid', 'glycolic': 'glycolic-acid', 'lactic': 'lactic-acid',
    'retinol': 'retinol', 'retinoid': 'retinol', 'retinal': 'retinol', 'tretinoin': 'retinol', 'adapalene': 'adapalene', 'differin': 'adapalene',
    'vitamin c': 'vitamin-c', 'vit c': 'vitamin-c', 'ascorbic': 'vitamin-c', 'niacinamide': 'niacinamide', 'vitamin b3': 'niacinamide',
    'hyaluronic': 'hyaluronic-acid', ' ha ': 'hyaluronic-acid', 'ceramide': 'ceramides', 'benzoyl': 'benzoyl-peroxide', 'bpo': 'benzoyl-peroxide',
    'azelaic': 'azelaic-acid', 'arbutin': 'alpha-arbutin', 'tranexamic': 'tranexamic-acid', 'txa': 'tranexamic-acid', 'kojic': 'kojic-acid',
    'zinc oxide': 'zinc-oxide', 'centella': 'centella', 'cica': 'centella', 'peptide': 'peptides', 'squalane': 'squalane', 'glycerin': 'glycerin',
    'zinc pca': 'zinc-pca', 'clay': 'clay', 'multani': 'clay', 'ketoconazole': 'ketoconazole', 'pyrithione': 'zinc-pyrithione', 'selenium': 'selenium-sulfide',
    'minoxidil': 'minoxidil', 'rosemary': 'rosemary-oil', 'caffeine': 'caffeine', 'tea tree': 'tea-tree', 'argan': 'argan-oil',
    'silicone': 'silicones', 'dimethicone': 'silicones', 'protein': 'proteins', 'keratin': 'proteins',
  };
  function detectIngs(text) {
    const t = ' ' + String(text).toLowerCase().replace(/[^a-z0-9% ]/g, ' ') + ' ';
    const found = new Set();
    for (const [k, id] of Object.entries(ALIASES)) if (t.includes(k)) found.add(id);
    return [...found];
  }

  function compatCheck(ids) {
    const set = [...new Set(ids)];
    const out = [];
    for (let i = 0; i < set.length; i++) for (let j = i + 1; j < set.length; j++) {
      const r = COMPAT_RULES.find((x) => (x.a === set[i] && x.b === set[j]) || (x.a === set[j] && x.b === set[i]));
      if (r) out.push({ ...r, a: set[i], b: set[j] });
      else if (ING[set[i]]?.avoid.includes(set[j]) || ING[set[j]]?.avoid.includes(set[i]))
        out.push({ a: set[i], b: set[j], level: 'caution', why: 'Both are strong actives; layering may irritate.', fix: 'Use at different times of day or alternate days.' });
    }
    const order = { avoid: 0, caution: 1, ok: 2 };
    return out.sort((x, y) => order[x.level] - order[y.level]);
  }
  const compatHTML = (r) => `<div class="alert ${r.level}"><b>${r.level === 'avoid' ? '⛔ Avoid together' : r.level === 'caution' ? '⚠ Use with caution' : '✓ Works well'} — ${esc(ING[r.a]?.name || r.a)} + ${esc(ING[r.b]?.name || r.b)}</b>${esc(r.why)}${r.fix && r.fix !== '—' ? `<div class="small muted" style="margin-top:4px">Fix: ${esc(r.fix)}</div>` : ''}</div>`;

  /* ================= state: cart / wishlist ================= */
  const cart = {
    get: () => store.get('cart', {}),
    add(key, qty = 1) { const c = cart.get(); c[key] = (c[key] || 0) + qty; store.set('cart', c); badges(); toast('Added to cart'); },
    setQty(key, q) { const c = cart.get(); if (q <= 0) delete c[key]; else c[key] = q; store.set('cart', c); badges(); render(); },
    lines() {
      return Object.entries(cart.get()).map(([key, qty]) => {
        if (PROD[key]) return { key, qty, name: PROD[key].name, unit: PROD[key].price, item: PROD[key] };
        const b = BUND[key]; if (!b) return null;
        const full = b.items.reduce((s, i) => s + PROD[i].price, 0);
        return { key, qty, name: b.name + ' (bundle)', unit: full * (1 - b.off / 100), full, item: b };
      }).filter(Boolean);
    },
    total() { return cart.lines().reduce((s, l) => s + l.unit * l.qty, 0); },
  };
  const wish = {
    get: () => store.get('wish', []),
    toggle(id) { const w = wish.get(); const i = w.indexOf(id); i >= 0 ? w.splice(i, 1) : w.push(id); store.set('wish', w); badges(); toast(i >= 0 ? 'Removed from wishlist' : 'Saved to wishlist'); render(); },
    has: (id) => wish.get().includes(id),
  };
  function badges() {
    const c = Object.values(cart.get()).reduce((a, b) => a + b, 0), w = wish.get().length;
    const cc = $('#cartCount'), wc = $('#wishCount');
    cc.textContent = c; cc.classList.toggle('hidden', !c);
    wc.textContent = w; wc.classList.toggle('hidden', !w);
  }

  /* ================= shared UI pieces ================= */
  const bottleClass = (p) => /Moisturizer|Mask/.test(p.type) ? 'jar' : /Sunscreen|Cleanser|Treatment|Shampoo/.test(p.type) ? 'tube' : '';
  const stars = (r) => '★'.repeat(Math.round(r)) + '☆'.repeat(5 - Math.round(r));

  function productReviews(p) {
    const r = rng(hash(p.id)), out = [];
    const types = p.cat === 'skin' ? ['oily', 'dry', 'combination', 'sensitive', 'normal'] : ['oilyScalp', 'normalScalp', 'dryScalp'];
    const n = 8 + Math.floor(r() * 8);
    for (let i = 0; i < n; i++) {
      const t = types[Math.floor(r() * types.length)];
      const fit = p.skin.includes(t);
      const rating = Math.max(1, Math.min(5, Math.round((fit ? 4.2 : 3.1) + (r() - 0.5) * 2)));
      const bank = REVIEW_BANK[t];
      out.push({ type: t, rating, text: bank[Math.floor(r() * bank.length)], sample: true });
    }
    return [...store.get('reviews.' + p.id, []), ...out];
  }
  const avgRating = (p) => { const rs = productReviews(p); return rs.reduce((s, x) => s + x.rating, 0) / rs.length; };
  const typeLabel = (t) => ({ oily: 'Oily', dry: 'Dry', combination: 'Combination', sensitive: 'Sensitive', normal: 'Normal', oilyScalp: 'Oily scalp', normalScalp: 'Normal scalp', dryScalp: 'Dry scalp' }[t] || t);

  function productCard(p) {
    return `<div class="card hover fade-in">
      <button class="icon-btn wish" onclick="App.wish.toggle('${p.id}')" aria-label="Wishlist">${wish.has(p.id) ? '♥' : '♡'}</button>
      <a href="#/product/${p.id}" style="color:inherit;text-decoration:none">
        <div class="prod-img" style="--h:${p.hue}"><div class="bottle ${bottleClass(p)}"></div></div>
        <div class="row" style="gap:6px;margin-bottom:6px"><span class="pill cyan">${esc(p.type)}</span>${p.vegan ? '<span class="pill lime">Vegan</span>' : ''}${p.ff ? '<span class="pill">Fragrance-free</span>' : ''}</div>
        <h3>${esc(p.name)}</h3>
        <div class="stars small">${stars(avgRating(p))} <span class="muted">${avgRating(p).toFixed(1)}</span></div>
      </a>
      <div class="row between mt"><span class="price">${inr(p.price)}</span><button class="btn sm primary" onclick="App.cart.add('${p.id}')">Add +</button></div>
    </div>`;
  }

  function bundleCard(b) {
    const full = b.items.reduce((s, i) => s + PROD[i].price, 0);
    return `<div class="card hover glow-border fade-in">
      <span class="pill mag">Save ${b.off}%</span>
      <h3 style="margin-top:12px">${esc(b.name)}</h3>
      <p class="muted small">${esc(b.desc)}</p>
      <ul class="clean small">${b.items.map((i) => `<li><a href="#/product/${i}">${esc(PROD[i].name)}</a></li>`).join('')}</ul>
      <div class="row between mt"><span class="price">${inr(full * (1 - b.off / 100))}<s>${inr(full)}</s></span><button class="btn sm primary" onclick="App.cart.add('${b.id}')">Add kit</button></div>
    </div>`;
  }

  const dermBox = (list, title = 'See a dermatologist if…') => list?.length ? `<div class="card derm-box"><h3>⚕ ${esc(title)}</h3><ul>${list.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><p class="small muted" style="margin:0">This is general guidance, not a diagnosis.</p></div>` : '';

  const head = (eyebrow, title, sub) => `<div class="page-head fade-in"><span class="eyebrow">${eyebrow}</span><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div>`;

  /* ================= pages ================= */
  const pages = {};

  pages.home = () => {
    const featured = ['p4', 'p3', 'p2', 'h2'].map((id) => PROD[id]);
    const quiz = store.get('quiz', {});
    return `
    <section class="hero">
      <div class="fade-in">
        <span class="eyebrow">Skin & Hair Intelligence · v2.6</span>
        <h1>Decode your skin.<br><span class="grad-text">Engineer your hair.</span></h1>
        <p class="lead">Science-first routines tuned for Indian humidity and UV. Take the 2-minute quiz, build your AM/PM routine, check what not to mix — all private, all in your browser.</p>
        <div class="row mt">
          <a href="#/quiz" class="btn primary">${quiz.skin ? 'Retake the quiz' : 'Start the type quiz'} →</a>
          <a href="#/analyze" class="btn">Scan my skin</a>
          <a href="#/shop" class="btn ghost">Shop</a>
        </div>
        <div class="hero-stats">
          <div><b class="grad-text">${INGREDIENTS.length}</b><span>ingredients decoded</span></div>
          <div><b class="grad-text">${COMPAT_RULES.length}</b><span>mixing rules</span></div>
          <div><b class="grad-text">${CITIES.length}</b><span>Indian cities, live UV</span></div>
        </div>
      </div>
      <div class="orb-wrap">
        <div class="ring"><span class="dot"></span></div>
        <div class="ring r2"><span class="dot"></span></div>
        <div class="orb"></div>
        <div class="orb-label" style="top:8%;left:-4%">Type <b>${quiz.skin ? esc(quiz.skin.title) : 'scan'}</b></div>
        <div class="orb-label" style="bottom:14%;right:-6%;animation-delay:-2s">UV today <b><a href="#/climate">check →</a></b></div>
        <div class="orb-label" style="bottom:2%;left:6%;animation-delay:-3.5s">Routine <b>${(store.get('routine', null) ? 'saved ✓' : 'build →')}</b></div>
      </div>
    </section>

    <div class="ticker"><div>${Array(2).fill(['<b>SPF 50</b> PA++++ · reapply every 2–3 h', '<b>Retinol</b> + AHA = alternate nights', '<b>Niacinamide</b> + Vitamin C = fine together', '<b>Monsoon</b> → switch to gel textures', '<b>Hair fall?</b> check ferritin, D3, B12, thyroid', '<b>Lemon</b> on skin = phototoxic, skip it'].map((t) => `<span>${t}</span>`).join('')).join('')}</div></div>

    <section class="section">
      <span class="eyebrow">Personalize</span><h2>Your lab, your rules</h2>
      <div class="grid g3 mt">
        ${[
          ['◎', 'Type Quiz', '7 questions → your skin type and a starter routine.', '#/quiz'],
          ['⇅', 'Routine Builder', 'Drag together AM & PM steps. Conflicts flagged live.', '#/routine'],
          ['⌬', 'Ingredient Checker', 'What niacinamide does, who it suits, what not to mix.', '#/ingredients'],
          ['⚠', 'Compatibility', 'Retinol + AHA? BPO + Vitamin C? Get a straight answer.', '#/compat'],
          ['☀', 'Climate Tips', 'Live UV index & humidity for your city with advice.', '#/climate'],
          ['◉', 'AI Skin Scan', 'On-device photo analysis for shine, redness & spots.', '#/analyze'],
        ].map(([i, t, d, h]) => `<a class="card hover" href="${h}"><div class="ico">${i}</div><h3>${t}</h3><p class="muted small" style="margin:0">${d}</p></a>`).join('')}
      </div>
    </section>

    <section class="section">
      <div class="row between"><div><span class="eyebrow">Skin</span><h2>Target a concern</h2></div><a href="#/skin">All skin →</a></div>
      <div class="grid g3 mt">${CONCERNS.skin.map((c) => `<a class="card hover" href="#/skin/${c.id}"><div class="ico">${c.icon}</div><h3>${c.name}</h3><p class="muted small" style="margin:0">${c.tag}</p></a>`).join('')}</div>
    </section>

    <section class="section">
      <div class="row between"><div><span class="eyebrow">Hair</span><h2>Scalp to ends</h2></div><a href="#/hair">All hair →</a></div>
      <div class="grid g3 mt">${CONCERNS.hair.map((c) => `<a class="card hover" href="#/hair/${c.id}"><div class="ico">${c.icon}</div><h3>${c.name}</h3><p class="muted small" style="margin:0">${c.tag}</p></a>`).join('')}</div>
    </section>

    <section class="section">
      <div class="row between"><div><span class="eyebrow">Featured</span><h2>Lab favourites</h2></div><a href="#/shop">Shop all →</a></div>
      <div class="grid g4 mt">${featured.map(productCard).join('')}</div>
      <div class="grid g2 mt">${bundleCard(BUNDLES[0])}${bundleCard(BUNDLES[3])}</div>
    </section>

    <section class="section">
      <div class="row between"><div><span class="eyebrow">Learn</span><h2>Fresh from the journal</h2></div><a href="#/blog">All articles →</a></div>
      <div class="grid g3 mt">${ARTICLES.slice(0, 3).map(articleCard).join('')}</div>
    </section>

    <section class="section">
      <div class="card glow-border">
        <div class="grid g3">
          <div><div class="ico">⚕</div><h3>Not medical advice</h3><p class="muted small">Education only. See a dermatologist for diagnosis and prescriptions.</p></div>
          <div><div class="ico">🔒</div><h3>Private by design</h3><p class="muted small">Photos and data never leave your device. <a href="#/privacy">Privacy policy</a></p></div>
          <div><div class="ico">⚑</div><h3>Know the red flags</h3><p class="muted small">Changing moles, sudden hair loss, painful cystic acne → see a doctor.</p></div>
        </div>
      </div>
    </section>`;
  };

  /* ---------- concerns ---------- */
  pages.area = (area) => head(area === 'skin' ? 'Skin' : 'Hair', area === 'skin' ? 'Skin concerns, decoded' : 'Hair & scalp, decoded',
    area === 'skin' ? 'Pick what bothers you most. Each guide covers causes, the ingredients with real evidence, a simple routine, and when to see a dermatologist.' : 'From hair fall to frizz — what is actually happening and what helps.') +
    `<div class="grid g3">${CONCERNS[area].map((c) => `<a class="card hover fade-in" href="#/${area}/${c.id}"><div class="ico">${c.icon}</div><h3>${c.name}</h3><p class="muted small">${c.tag}</p><p class="small" style="margin:0">${esc(c.summary.slice(0, 120))}…</p></a>`).join('')}</div>
    <div class="card mt"><div class="row between"><div><h3>Not sure where to start?</h3><p class="muted small" style="margin:0">Take the quiz and we will point you to the right guide.</p></div><a class="btn primary" href="#/quiz">Take the quiz</a></div></div>`;

  pages.concern = (area, id) => {
    const c = CONCERNS[area]?.find((x) => x.id === id);
    if (!c) return pages.notFound();
    const rel = PRODUCTS.filter((p) => p.concerns.includes(c.id)).slice(0, 4);
    return `<div class="crumbs"><a href="#/${area}">${area === 'skin' ? 'Skin' : 'Hair'}</a> / ${c.name}</div>
    ${head(c.icon + ' ' + (area === 'skin' ? 'Skin' : 'Hair'), c.name, esc(c.summary))}
    <div class="grid g2">
      <div class="card"><h3>Common types</h3><ul class="clean">${c.types.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>
      <div class="card"><h3>Key ingredients</h3><div class="chip-group mt">${c.ingredients.map((i) => ING[i] ? `<a class="pill cyan" href="#/ingredients/${i}">${esc(ING[i].name)}</a>` : `<span class="pill">${esc(i)}</span>`).join('')}</div>
        <p class="small muted mt" style="margin-bottom:0">Tap an ingredient to see what it does and what not to mix it with.</p></div>
    </div>
    <div class="card mt">
      <div class="row between"><h3 style="margin:0">Suggested routine</h3><button class="btn sm" onclick="App.loadRoutine('${area}','${c.id}')">Load into Routine Builder</button></div>
      <div class="grid g2 mt">
        <div><span class="pill amber">☀ AM</span><ol>${c.routine.am.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></div>
        <div><span class="pill mag">☾ PM</span><ol>${c.routine.pm.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></div>
      </div>
    </div>
    <div class="grid g2 mt">
      <div class="card"><h3>Pro tips</h3><ul class="clean">${c.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>
      ${dermBox(c.derm) || '<div class="card"><h3>Good to know</h3><p class="muted">Most cases respond well to consistent home care. If something feels off, a consultation never hurts.</p></div>'}
    </div>
    ${rel.length ? `<div class="section"><h2>Products for ${c.name.toLowerCase()}</h2><div class="grid g4 mt">${rel.map(productCard).join('')}</div></div>` : ''}`;
  };

  /* ---------- quiz ---------- */
  let quizState = null;
  pages.quiz = () => {
    if (!quizState) {
      const saved = store.get('quiz', {});
      return head('Personalize', 'Find your <span class="grad-text">type</span>', 'Two short quizzes. Answer based on how your skin and hair behave with no products on. Results are saved to your account on this device.') +
        `<div class="grid g2">
          <div class="card hover glow-border"><div class="ico">◐</div><h3>Skin type quiz</h3><p class="muted small">${SKIN_QUIZ.length} questions · ~90 seconds</p>
            ${saved.skin ? `<p class="small">Last result: <b class="grad-text">${esc(saved.skin.title)}</b> <span class="muted">(${esc(saved.skin.date)})</span></p>` : ''}
            <button class="btn primary" onclick="App.quiz.start('skin')">Start skin quiz</button></div>
          <div class="card hover glow-border"><div class="ico">⌇</div><h3>Hair & scalp quiz</h3><p class="muted small">${HAIR_QUIZ.length} questions · ~60 seconds</p>
            ${saved.hair ? `<p class="small">Last result: <b class="grad-text">${esc(saved.hair.title)}</b> <span class="muted">(${esc(saved.hair.date)})</span></p>` : ''}
            <button class="btn primary" onclick="App.quiz.start('hair')">Start hair quiz</button></div>
        </div>`;
    }
    const Q = quizState.track === 'skin' ? SKIN_QUIZ : HAIR_QUIZ;
    if (quizState.i >= Q.length) return quizResult();
    const q = Q[quizState.i];
    return `<div class="card quiz-card fade-in" style="margin-top:20px">
      <div class="row between small muted"><span>${quizState.track === 'skin' ? 'Skin' : 'Hair'} quiz</span><span>${quizState.i + 1} / ${Q.length}</span></div>
      <div class="progress"><i style="width:${(quizState.i / Q.length) * 100}%"></i></div>
      <h2>${esc(q.q)}</h2>
      <div class="mt">${q.a.map((a, k) => `<button class="opt ${quizState.ans[quizState.i] === k ? 'sel' : ''}" onclick="App.quiz.answer(${k})">${esc(a[0])}</button>`).join('')}</div>
      <div class="row between mt"><button class="btn ghost sm" onclick="App.quiz.back()" ${quizState.i === 0 ? 'disabled' : ''}>← Back</button><button class="btn ghost sm" onclick="App.quiz.quit()">Exit</button></div>
    </div>`;
  };
  function scoreQuiz() {
    const Q = quizState.track === 'skin' ? SKIN_QUIZ : HAIR_QUIZ, s = {};
    quizState.ans.forEach((k, i) => Object.entries(Q[i].a[k][1]).forEach(([key, v]) => (s[key] = (s[key] || 0) + v)));
    return s;
  }
  function quizResult() {
    const s = scoreQuiz();
    let result;
    if (quizState.track === 'skin') {
      const base = ['oily', 'dry', 'combination', 'normal'].sort((a, b) => (s[b] || 0) - (s[a] || 0))[0];
      const type = (s.sensitive || 0) >= 3 ? 'sensitive' : base;
      const R = SKIN_RESULTS[type];
      const extras = [];
      const pm = [...R.pm], am = [...R.am];
      if ((s.acne || 0) >= 3) { extras.push(['acne', 'Breakout-prone: add salicylic acid or adapalene at night (not both on the same night).']); if (!pm.some((x) => /salicylic/i.test(x))) pm.splice(1, 0, 'Salicylic acid 2% (3×/week)'); }
      if ((s.pigment || 0) >= 3) { extras.push(['pigmentation', 'Dark spots: add alpha arbutin or azelaic acid; sunscreen is non-negotiable.']); pm.splice(1, 0, 'Alpha arbutin / azelaic acid'); }
      if ((s.aging || 0) >= 3) { extras.push(['anti-aging', 'Fine lines: introduce retinol 2×/week at night (on non-acid nights).']); }
      if ((s.sun || 0) >= 3) { extras.push(['sun-care', 'Lots of sun time: reapply SPF every 2–3 hours; consider a cap and tinted sunscreen.']); am.push('Reapply SPF midday'); }
      result = { title: R.title + ((s.acne || 0) >= 3 ? ' · Acne-prone' : ''), type, blurb: R.blurb, am, pm, extras, date: today() };
    } else {
      const scalp = ['oilyScalp', 'normalScalp', 'dryScalp'].sort((a, b) => (s[b] || 0) - (s[a] || 0))[0];
      const texture = ['straight', 'wavy', 'curly'].find((t) => s[t]) || 'straight';
      const label = { oilyScalp: 'Oily scalp', normalScalp: 'Balanced scalp', dryScalp: 'Dry scalp' }[scalp];
      const am = ['Leave-in / serum on damp lengths', 'Loose hairstyle'], pm = [], extras = [];
      const wash = scalp === 'oilyScalp' ? 'Shampoo every 1–2 days' : scalp === 'dryScalp' ? 'Gentle shampoo 2×/week' : 'Shampoo every 2–3 days';
      pm.push(wash, 'Conditioner on lengths only', '4-min scalp massage');
      if ((s.dandruff || 0) >= 3) { extras.push(['dandruff', 'Flakes: anti-dandruff shampoo (ketoconazole/ZPT) 2–3×/week, lather left 5 min. Skip overnight oiling.']); pm[0] = 'Anti-dandruff shampoo 2–3×/week'; }
      if ((s.fall || 0) >= 3) extras.push(['hair-fall', 'Shedding: check ferritin, vitamin D, B12 & thyroid. Sudden clumps = see a doctor.']);
      if ((s.frizz || 0) >= 3) { extras.push(['frizz', 'Frizz: silicone serum on damp hair, satin pillowcase, avoid towel-rubbing.']); am.unshift('Anti-frizz serum'); }
      if ((s.damage || 0) >= 3) { extras.push(['styling', 'Heat/chemical damage: heat protectant always, weekly bond/protein mask.']); pm.push('Weekly repair mask'); }
      result = { title: `${label} · ${texture[0].toUpperCase() + texture.slice(1)} hair`, type: scalp, blurb: `Your scalp leans ${label.toLowerCase()} with ${texture} texture. Wash frequency should match your oil level — not a fixed rule.`, am, pm, extras, date: today() };
    }
    const saved = store.get('quiz', {}); saved[quizState.track] = result; store.set('quiz', saved);
    const track = quizState.track;
    const recs = PRODUCTS.filter((p) => p.skin.includes(result.type) && (track === 'skin' ? p.cat === 'skin' : p.cat === 'hair')).slice(0, 4);
    return `<div class="fade-in">${head('Your result', `<span class="grad-text">${esc(result.title)}</span>`, esc(result.blurb))}
      <div class="grid g2">
        <div class="card"><span class="pill amber">☀ Morning</span><ol>${result.am.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></div>
        <div class="card"><span class="pill mag">☾ Night</span><ol>${result.pm.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></div>
      </div>
      ${result.extras.length ? `<div class="card mt"><h3>Personal notes</h3>${result.extras.map(([c, t]) => `<div class="alert info">${esc(t)} <a href="#/${concernById(c)?.area}/${c}">Read guide →</a></div>`).join('')}</div>` : ''}
      <div class="row mt"><button class="btn primary" onclick="App.quiz.toRoutine('${track}')">Save as my routine →</button><button class="btn" onclick="App.quiz.start('${track}')">Retake</button><button class="btn ghost" onclick="App.quiz.quit()">Back to quizzes</button></div>
      ${recs.length ? `<div class="section"><h2>Matches for you</h2><div class="grid g4 mt">${recs.map(productCard).join('')}</div></div>` : ''}
      <p class="small muted">Quiz results are a starting point, not a diagnosis.</p></div>`;
  }
  const quiz = {
    start(track) { quizState = { track, i: 0, ans: [] }; render(); },
    answer(k) { quizState.ans[quizState.i] = k; quizState.i++; render(); },
    back() { quizState.i = Math.max(0, quizState.i - 1); render(); },
    quit() { quizState = null; render(); },
    toRoutine(track) {
      const r = store.get('quiz', {})[track];
      const mk = (arr) => arr.map((s) => ({ id: uid(), step: s, product: '' }));
      const cur = store.get('routine', { am: [], pm: [], name: 'My routine' });
      if (track === 'skin') { cur.am = mk(r.am); cur.pm = mk(r.pm); } else { cur.hair = { am: mk(r.am), pm: mk(r.pm) }; }
      store.set('routine', cur); quizState = null; go('#/routine'); toast('Routine saved');
    },
  };

  /* ---------- routine builder ---------- */
  let routineTab = 'am';
  const STEP_PRESETS = ['Cleanser', 'Toner', 'Vitamin C serum', 'Niacinamide serum', 'Hyaluronic acid', 'Salicylic acid (BHA)', 'Glycolic acid (AHA)', 'Retinol', 'Azelaic acid', 'Eye cream', 'Moisturizer', 'Sunscreen SPF 50', 'Face oil', 'Spot treatment (BPO)'];
  function getRoutine() { return store.get('routine', { name: 'My routine', am: [], pm: [] }); }
  pages.routine = () => {
    const r = getRoutine();
    const list = r[routineTab] || [];
    const ingsAM = (r.am || []).flatMap((s) => detectIngs(s.step + ' ' + s.product + ' ' + (PROD[s.pid]?.ingredients || []).join(' ')));
    const ingsPM = (r.pm || []).flatMap((s) => detectIngs(s.step + ' ' + s.product + ' ' + (PROD[s.pid]?.ingredients || []).join(' ')));
    const conflicts = [...compatCheck(ingsAM).map((x) => ({ ...x, when: 'AM' })), ...compatCheck(ingsPM).map((x) => ({ ...x, when: 'PM' }))].filter((x) => x.level !== 'ok');
    const orderHint = (r.am || []).length && !/sun|spf/i.test((r.am.at(-1) || {}).step || '') ? '<div class="alert caution"><b>Sunscreen should be the last AM step.</b>Move it to the end, or add one.</div>' : '';
    const hasRetinoid = ingsPM.some((i) => ['retinol', 'adapalene'].includes(i));
    const noSpf = !(r.am || []).some((s) => /sun|spf/i.test(s.step + s.product));
    return head('Personalize', 'Routine <span class="grad-text">Builder</span>', 'Build morning and night steps. The builder detects actives from your step names and flags risky combos as you go. Saved automatically on this device.') +
    `<div class="grid" style="grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:24px" id="routineGrid">
      <div class="card">
        <div class="tabs"><button class="${routineTab === 'am' ? 'on' : ''}" onclick="App.routine.tab('am')">☀ Morning (${(r.am || []).length})</button><button class="${routineTab === 'pm' ? 'on' : ''}" onclick="App.routine.tab('pm')">☾ Night (${(r.pm || []).length})</button></div>
        ${list.length ? list.map((s, i) => `<div class="step">
          <span class="num">${i + 1}</span>
          <div class="body"><b>${esc(s.step)}</b>
            <input type="text" value="${esc(s.product)}" placeholder="Product name (optional)" onchange="App.routine.edit('${s.id}', this.value)">
          </div>
          <div class="ctrl"><button title="Up" onclick="App.routine.move('${s.id}',-1)">↑</button><button title="Down" onclick="App.routine.move('${s.id}',1)">↓</button><button title="Remove" onclick="App.routine.remove('${s.id}')">✕</button></div>
        </div>`).join('') : '<p class="muted center" style="padding:30px 0">No steps yet. Add one below or <a href="#/quiz">take the quiz</a> to auto-fill.</p>'}
        <div class="row mt">
          <select id="stepSel" style="flex:1;min-width:160px">${STEP_PRESETS.map((s) => `<option>${s}</option>`).join('')}<option value="__custom">Custom step…</option></select>
          <input type="text" id="stepCustom" placeholder="Custom step name" style="flex:1;min-width:140px">
          <select id="stepProd" style="flex:1;min-width:160px"><option value="">— or pick a shop product —</option>${PRODUCTS.filter((p) => p.cat === 'skin').map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>
          <button class="btn primary" onclick="App.routine.add()">Add step</button>
        </div>
        <div class="row mt small">
          <button class="btn sm ghost" onclick="App.routine.template('beginner')">Beginner template</button>
          <button class="btn sm ghost" onclick="App.routine.template('acne')">Acne template</button>
          <button class="btn sm ghost" onclick="App.routine.template('glow')">Pigmentation template</button>
          <button class="btn sm danger" onclick="App.routine.clear()">Clear ${routineTab.toUpperCase()}</button>
        </div>
      </div>
      <div>
        <div class="card"><h3>Live check</h3>
          ${conflicts.length ? conflicts.map((c) => `<div class="small muted" style="margin-bottom:4px">${c.when} routine</div>` + compatHTML(c)).join('') : '<div class="alert ok"><b>✓ No conflicts detected</b>Your active combinations look fine.</div>'}
          ${orderHint}
          ${hasRetinoid && noSpf ? '<div class="alert avoid"><b>Retinoid without sunscreen</b>Retinoids increase sun sensitivity — add SPF to your morning.</div>' : ''}
          <p class="small muted">Order rule of thumb: thinnest → thickest. Water-based serums before creams; sunscreen last in the morning.</p>
        </div>
        <div class="card mt"><h3>Export</h3><p class="small muted">Copy it to your notes, or set reminders so you never skip a step.</p>
          <div class="row"><a class="btn sm" href="#/reminders">Set reminders</a><button class="btn sm" onclick="App.routine.copy()">Copy as text</button></div></div>
        ${r.hair ? `<div class="card mt"><h3>Hair routine</h3><div class="small"><b>AM:</b> ${r.hair.am.map((s) => esc(s.step)).join(' → ')}</div><div class="small mt"><b>PM:</b> ${r.hair.pm.map((s) => esc(s.step)).join(' → ')}</div></div>` : ''}
      </div>
    </div>
    <style>@media(max-width:860px){#routineGrid{grid-template-columns:1fr!important}}</style>`;
  };
  const ROUTINE_TEMPLATES = {
    beginner: { am: ['Cleanser', 'Moisturizer', 'Sunscreen SPF 50'], pm: ['Cleanser', 'Moisturizer'] },
    acne: { am: ['Gel cleanser', 'Niacinamide serum', 'Gel moisturizer', 'Sunscreen SPF 50'], pm: ['Gel cleanser', 'Salicylic acid (BHA)', 'Gel moisturizer'] },
    glow: { am: ['Cleanser', 'Vitamin C serum', 'Moisturizer', 'Sunscreen SPF 50'], pm: ['Cleanser', 'Azelaic acid', 'Moisturizer'] },
  };
  const routine = {
    tab(t) { routineTab = t; render(); },
    save(r) { store.set('routine', r); render(); },
    add() {
      const r = getRoutine(); const sel = $('#stepSel').value, pid = $('#stepProd').value;
      let step = sel;
      if (pid) step = PROD[pid].type;
      else if (sel === '__custom') { step = $('#stepCustom').value.trim(); if (!step) { $('#stepCustom').focus(); return toast('Type a name for your custom step'); } }
      (r[routineTab] ||= []).push({ id: uid(), step, product: pid ? PROD[pid].name : '', pid: pid || undefined });
      routine.save(r);
    },
    edit(id, v) { const r = getRoutine(); const s = r[routineTab].find((x) => x.id === id); if (s) { s.product = v; s.pid = undefined; } routine.save(r); },
    move(id, d) { const r = getRoutine(), l = r[routineTab], i = l.findIndex((x) => x.id === id), j = i + d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; routine.save(r); },
    remove(id) { const r = getRoutine(); r[routineTab] = r[routineTab].filter((x) => x.id !== id); routine.save(r); },
    clear() { askConfirm('Clear all ' + routineTab.toUpperCase() + ' steps?', () => { const r = getRoutine(); r[routineTab] = []; routine.save(r); }, 'Clear'); },
    template(k) { const r = getRoutine(), t = ROUTINE_TEMPLATES[k]; r.am = t.am.map((s) => ({ id: uid(), step: s, product: '' })); r.pm = t.pm.map((s) => ({ id: uid(), step: s, product: '' })); routine.save(r); toast('Template loaded'); },
    copy() {
      const r = getRoutine(), f = (l) => (l || []).map((s, i) => `${i + 1}. ${s.step}${s.product ? ' — ' + s.product : ''}`).join('\n');
      const txt = `MORNING\n${f(r.am)}\n\nNIGHT\n${f(r.pm)}`;
      copyText(txt);
    },
  };
  function copyText(txt) {
    const fallback = () => dialog(`<p class="small muted">Select the text below and copy it.</p><textarea id="copyBox" rows="10" readonly>${esc(txt)}</textarea>`);
    try { navigator.clipboard.writeText(txt).then(() => toast('Copied!'), fallback); } catch { fallback(); }
  }
  function loadRoutine(area, id) {
    const c = CONCERNS[area].find((x) => x.id === id); const r = getRoutine();
    const mk = (arr) => arr.filter((s) => s !== '—').map((s) => ({ id: uid(), step: s, product: '' }));
    if (area === 'skin') { r.am = mk(c.routine.am); r.pm = mk(c.routine.pm); } else r.hair = { am: mk(c.routine.am), pm: mk(c.routine.pm) };
    store.set('routine', r); go('#/routine'); toast(c.name + ' routine loaded');
  }

  /* ---------- ingredient checker ---------- */
  pages.ingredients = (sel) => {
    const i = sel && ING[sel];
    return head('Tools', 'Ingredient <span class="grad-text">Checker</span>', 'Search any active — see what it does, who it suits, and what not to mix it with.') +
    `<div class="card"><input type="search" id="ingQ" placeholder="Try: niacinamide, salicylic acid, retinol, minoxidil…" oninput="App.ing.filter(this.value)" list="ingList" autocomplete="off">
      <datalist id="ingList">${INGREDIENTS.map((x) => `<option value="${esc(x.name)}">`).join('')}</datalist></div>
    ${i ? ingDetail(i) : ''}
    <div class="grid g4 mt" id="ingGrid">${INGREDIENTS.map((x) => `<a class="card hover" data-q="${esc((x.name + ' ' + x.aka + ' ' + x.group + ' ' + x.suits.join(' ')).toLowerCase())}" href="#/ingredients/${x.id}"><span class="pill ${x.evidence === 'Strong' ? 'lime' : x.evidence === 'Limited' ? 'amber' : 'cyan'}">${x.evidence} evidence</span><h3 style="margin-top:10px">${esc(x.name)}</h3><p class="small muted" style="margin:0">${esc(x.group)}${x.aka ? ' · ' + esc(x.aka) : ''}</p></a>`).join('')}</div>`;
  };
  function ingDetail(i) {
    const prods = PRODUCTS.filter((p) => p.ingredients.includes(i.id));
    const rules = COMPAT_RULES.filter((r) => r.a === i.id || r.b === i.id);
    return `<div class="card glow-border mt fade-in" id="ingDetail">
      <div class="row between"><div><span class="eyebrow">${esc(i.group)}</span><h2 style="margin:0">${esc(i.name)}</h2>${i.aka ? `<div class="muted">${esc(i.aka)}</div>` : ''}</div><span class="pill ${i.evidence === 'Strong' ? 'lime' : i.evidence === 'Limited' ? 'amber' : 'cyan'}">Evidence: ${i.evidence}</span></div>
      <div class="grid g2 mt">
        <div><h3>What it does</h3><p>${esc(i.does)}</p><h3>How to use</h3><p>${esc(i.use)}</p></div>
        <div><h3>Who it suits</h3><div class="chip-group">${i.suits.map((s) => `<span class="pill cyan">${esc(s)}</span>`).join('')}</div>
          <h3 class="mt">Caution</h3><p>${esc(i.caution)}</p></div>
      </div>
      <h3>Mixing</h3>
      ${rules.length ? rules.map((r) => compatHTML(r)).join('') : i.avoid.length ? i.avoid.map((a) => `<div class="alert caution"><b>Don't layer with ${esc(ING[a]?.name || a)}</b>Use at a different time of day.</div>`).join('') : '<div class="alert ok"><b>Plays well with others</b>No known problem combinations.</div>'}
      ${prods.length ? `<h3 class="mt">Found in</h3><div class="chip-group">${prods.map((p) => `<a class="pill mag" href="#/product/${p.id}">${esc(p.name)}</a>`).join('')}</div>` : ''}
    </div>`;
  }
  const ing = {
    filter(q) {
      q = q.toLowerCase().trim();
      const exact = INGREDIENTS.find((x) => x.name.toLowerCase() === q);
      if (exact) { go('#/ingredients/' + exact.id); return; }
      $$('#ingGrid > a').forEach((a) => a.classList.toggle('hidden', q && !a.dataset.q.includes(q)));
    },
  };

  /* ---------- compatibility checker ---------- */
  let compatSel = new Set(['retinol', 'glycolic-acid']);
  pages.compat = () => {
    const res = compatCheck([...compatSel]);
    const skinIngs = INGREDIENTS.filter((i) => !['Hair growth', 'Antifungal', 'Smoothing', 'Repair'].includes(i.group) || i.id === 'peptides');
    return head('Tools', 'Compatibility <span class="grad-text">Checker</span>', 'Select the actives (or products) you want to use together. We will tell you what is safe to layer, what to separate, and why.') +
    `<div class="grid" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px" id="compatGrid">
      <div class="card">
        <h3>1 · Pick ingredients</h3>
        <div class="chip-group">${skinIngs.map((i) => `<button class="chip ${compatSel.has(i.id) ? 'on' : ''}" onclick="App.compat.toggle('${i.id}')">${esc(i.name)}</button>`).join('')}</div>
        <h3 class="mt">2 · …or add products</h3>
        <div class="row"><select id="compatProd" style="flex:1">${PRODUCTS.filter((p) => p.cat === 'skin').map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select><button class="btn sm" onclick="App.compat.addProd()">Add</button></div>
        <h3 class="mt">Quick checks</h3>
        <div class="chip-group">
          ${[['retinol', 'glycolic-acid'], ['retinol', 'benzoyl-peroxide'], ['niacinamide', 'vitamin-c'], ['vitamin-c', 'benzoyl-peroxide'], ['retinol', 'niacinamide'], ['salicylic-acid', 'glycolic-acid']].map(([a, b]) => `<button class="chip" onclick="App.compat.set('${a}','${b}')">${ING[a].name} + ${ING[b].name}</button>`).join('')}
        </div>
        <button class="btn sm ghost mt" onclick="App.compat.clear()">Clear selection</button>
      </div>
      <div class="card">
        <h3>Result</h3>
        <p class="small muted">Selected: ${[...compatSel].map((i) => esc(ING[i]?.name)).join(', ') || 'nothing yet'}</p>
        ${compatSel.size < 2 ? '<div class="alert info"><b>Select at least two</b>Pick two or more ingredients to compare.</div>' : res.length ? res.map(compatHTML).join('') : '<div class="alert ok"><b>✓ No known conflicts</b>These can generally be used together. Patch test anything new.</div>'}
        ${res.some((r) => r.level === 'avoid') ? '<div class="card mt" style="padding:16px"><b>Smart schedule</b><p class="small muted" style="margin:6px 0 0">Mon/Wed/Fri: exfoliant night · Tue/Thu/Sat: retinoid night · Sun: recovery (moisturizer only). Vitamin C & BPO go in the morning.</p></div>' : ''}
      </div>
    </div><style>@media(max-width:860px){#compatGrid{grid-template-columns:1fr!important}}</style>`;
  };
  const compat = {
    toggle(id) { compatSel.has(id) ? compatSel.delete(id) : compatSel.add(id); render(); },
    set(a, b) { compatSel = new Set([a, b]); render(); },
    clear() { compatSel = new Set(); render(); },
    addProd() { PROD[$('#compatProd').value].ingredients.forEach((i) => compatSel.add(i)); render(); },
  };

  /* ---------- climate ---------- */
  let climate = store.get('climate', { city: 'Mumbai', data: null, manual: { uv: 9, hum: 78, temp: 32 } });
  pages.climate = () => {
    const d = climate.data && climate.data.city === climate.city ? climate.data : null;
    const v = d || climate.manual;
    const adv = climateAdvice(v);
    const uvPct = Math.min(100, (v.uv / 12) * 100);
    return head('Tools', 'Climate <span class="grad-text">Tips</span>', 'Indian weather swings from 95% monsoon humidity to dry North-Indian winters, with UV often 8–11+. Get advice for right now.') +
    `<div class="card"><div class="row">
      <select id="citySel" style="max-width:220px" onchange="App.climate.city(this.value)">${CITIES.map((c) => `<option ${c.name === climate.city ? 'selected' : ''}>${c.name}</option>`).join('')}</select>
      <button class="btn primary" onclick="App.climate.fetch()">Get live weather</button>
      <button class="btn" onclick="App.climate.locate()">Use my location</button>
      <span class="small muted" id="climStatus">${d ? 'Live data · updated ' + new Date(d.at).toLocaleTimeString() : 'Showing manual values — fetch live data or drag the sliders'}</span>
    </div></div>
    <div class="grid g3 mt">
      <div class="card center"><span class="eyebrow">UV Index</span><div class="weather-big" style="color:${uvColor(v.uv)}">${v.uv.toFixed(1)}</div><div class="uv-scale"><i style="left:calc(${uvPct}% - 2px)"></i></div><div class="small muted">${uvLabel(v.uv)}${d?.uvMax != null ? ' · today max ' + d.uvMax.toFixed(1) : ''}</div></div>
      <div class="card center"><span class="eyebrow">Humidity</span><div class="weather-big">${Math.round(v.hum)}<span style="font-size:1.4rem">%</span></div><div class="bar mt"><i style="width:${v.hum}%"></i></div><div class="small muted mt">${v.hum >= 70 ? 'Humid' : v.hum < 40 ? 'Dry' : 'Comfortable'}</div></div>
      <div class="card center"><span class="eyebrow">Temperature</span><div class="weather-big">${Math.round(v.temp)}<span style="font-size:1.4rem">°C</span></div><div class="small muted mt">${v.temp >= 35 ? 'Hot — sweat & heat' : v.temp <= 15 ? 'Cold — barrier stress' : 'Moderate'}</div></div>
    </div>
    <div class="grid g2 mt">
      <div class="card"><h3>☀ Skin advice for now</h3><ul class="clean">${adv.skin.map((t) => `<li>${t}</li>`).join('')}</ul></div>
      <div class="card"><h3>⌇ Hair advice for now</h3><ul class="clean">${adv.hair.map((t) => `<li>${t}</li>`).join('')}</ul></div>
    </div>
    <div class="card mt"><h3>Simulate conditions</h3><p class="small muted">Plan ahead for a trip — Goa monsoon, Delhi winter, Rajasthan summer.</p>
      <div class="grid g3">
        <div><label>UV index: <b id="uvV">${climate.manual.uv}</b></label><input type="range" min="0" max="12" step="0.5" value="${climate.manual.uv}" oninput="App.climate.manual('uv',this.value)"></div>
        <div><label>Humidity: <b id="humV">${climate.manual.hum}</b>%</label><input type="range" min="10" max="100" value="${climate.manual.hum}" oninput="App.climate.manual('hum',this.value)"></div>
        <div><label>Temperature: <b id="tempV">${climate.manual.temp}</b>°C</label><input type="range" min="0" max="48" value="${climate.manual.temp}" oninput="App.climate.manual('temp',this.value)"></div>
      </div>
      <div class="row mt"><button class="btn sm" onclick="App.climate.preset(11,85,31)">Monsoon coast</button><button class="btn sm" onclick="App.climate.preset(4,35,9)">North India winter</button><button class="btn sm" onclick="App.climate.preset(11,20,44)">Rajasthan summer</button><button class="btn sm" onclick="App.climate.preset(8,60,18)">Hill station</button></div>
    </div>
    <p class="small muted mt">Live data from Open-Meteo (free, no account). Your location is only sent to the weather service as rounded coordinates.</p>`;
  };
  function addMyLocation() {
    if (!climate.loc) return;
    const c = CITIES.find((x) => x.name === 'My location');
    if (c) Object.assign(c, climate.loc); else CITIES.push({ name: 'My location', ...climate.loc });
  }
  addMyLocation();
  let climateTried = false;
  const uvLabel = (u) => u < 3 ? 'Low' : u < 6 ? 'Moderate' : u < 8 ? 'High' : u < 11 ? 'Very high' : 'Extreme';
  const uvColor = (u) => u < 3 ? '#3ddc84' : u < 6 ? '#ffd23f' : u < 8 ? '#ff8c42' : u < 11 ? '#ff3b5c' : '#b44dff';
  function climateAdvice({ uv, hum, temp }) {
    const skin = [], hair = [];
    if (uv >= 8) skin.push(`<b>UV ${uvLabel(uv).toLowerCase()}:</b> SPF 50 PA++++, reapply every 2 hours outdoors. Hat + sunglasses. Avoid 11 am–3 pm sun.`);
    else if (uv >= 3) skin.push('<b>Moderate–high UV:</b> SPF 30–50 every morning; reapply if outdoors for long.');
    else skin.push('<b>Low UV:</b> Daily sunscreen is still a good habit, especially near windows.');
    if (uv >= 6) skin.push('Using retinol or AHA? Be extra strict with sunscreen today — your skin is more sun-sensitive.');
    if (hum >= 70) {
      skin.push('<b>Humid:</b> swap creams for gel moisturizers; one hydrating layer is enough.');
      skin.push('Watch for fungal acne (itchy, same-size bumps). Shower soon after sweating.');
      hair.push('<b>Frizz alert:</b> silicone-based serum on damp hair; skip high-glycerin stylers today.');
      hair.push('Wash more often if the scalp sweats; dry hair completely before tying.');
    } else if (hum < 40) {
      skin.push('<b>Dry air:</b> apply hyaluronic acid on damp skin and seal with a ceramide cream.');
      skin.push('Lukewarm showers only; use a richer night cream or a thin occlusive on dry patches.');
      hair.push('<b>Dry air:</b> leave-in conditioner and a few drops of oil on the ends; fewer shampoos.');
      hair.push('Static? A satin pillowcase and a tiny bit of serum help.');
    } else {
      skin.push('<b>Comfortable humidity:</b> your regular routine should work well.');
      hair.push('Balanced conditions — a good day to try a new style or mask.');
    }
    if (temp >= 35) { skin.push('<b>Heat:</b> heat can worsen melasma — seek shade, use a tinted sunscreen. Carry blotting papers & mist.'); hair.push('Tie hair loosely to reduce sweat buildup; cover with a scarf/cap in direct sun.'); }
    if (temp <= 15) { skin.push('<b>Cold:</b> barrier stress — pause strong actives if stinging, use a lip balm.'); hair.push('Avoid very hot water on the scalp; it worsens dryness and flakes.'); }
    skin.push('Drink water and eat hydrating foods — but water alone will not fix dry skin.');
    return { skin, hair };
  }
  const climateApi = {
    city(c) { climate.city = c; store.set('climate', climate); climateApi.fetch(); },
    async fetch(lat, lon, label) {
      const c = CITIES.find((x) => x.name === climate.city) || CITIES[0];
      lat ??= c.lat; lon ??= c.lon;
      const st = $('#climStatus'); if (st) st.textContent = 'Fetching live data…';
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}&current=temperature_2m,relative_humidity_2m,uv_index&daily=uv_index_max&timezone=auto&forecast_days=1`;
        const j = await (await fetch(url)).json();
        if (!j.current) throw new Error('no data');
        if (label) climate.city = label;
        climate.data = { city: climate.city, uv: j.current.uv_index ?? 0, hum: j.current.relative_humidity_2m, temp: j.current.temperature_2m, uvMax: j.daily?.uv_index_max?.[0], at: Date.now() };
        store.set('climate', climate); render();
      } catch { if (st) st.textContent = 'Could not reach the weather service — use the sliders below.'; }
    },
    locate() {
      if (!navigator.geolocation) return toast('Geolocation not supported');
      navigator.geolocation.getCurrentPosition((p) => {
        const label = 'My location';
        climate.loc = { lat: +p.coords.latitude.toFixed(2), lon: +p.coords.longitude.toFixed(2) };
        addMyLocation();
        climateApi.fetch(p.coords.latitude, p.coords.longitude, label);
      }, () => toast('Location permission denied'));
    },
    manual(k, v) { climate.manual[k] = +v; climate.data = null; store.set('climate', climate); render(); },
    preset(uv, hum, temp) { climate.manual = { uv, hum, temp }; climate.data = null; store.set('climate', climate); render(); },
  };

  /* ---------- blog ---------- */
  function articleCard(a) {
    return `<a class="card hover fade-in" href="#/blog/${a.id}"><div class="thumb" style="--h:${a.hue};font-size:1.2rem;font-family:var(--font-display)"><span class="pill cyan" style="position:absolute;top:12px;left:12px">${esc(a.cat)}</span></div><h3>${esc(a.title)}</h3><p class="small muted" style="margin:0">${a.read} min read</p></a>`;
  }
  let blogCat = 'All';
  pages.blog = () => {
    const cats = ['All', ...new Set(ARTICLES.map((a) => a.cat))];
    return head('Learn', 'The <span class="grad-text">Journal</span>', 'Myths vs facts, beginner routines, budget picks and seasonal guides.') +
    `<div class="chip-group">${cats.map((c) => `<button class="chip ${blogCat === c ? 'on' : ''}" onclick="App.blogCat('${c}')">${c}</button>`).join('')}</div>
    <div class="grid g3 mt">${ARTICLES.filter((a) => blogCat === 'All' || a.cat === blogCat).map(articleCard).join('')}</div>`;
  };
  pages.article = (id) => {
    const a = ARTICLES.find((x) => x.id === id); if (!a) return pages.notFound();
    const myth = a.cat === 'Myths vs Facts';
    return `<div class="crumbs"><a href="#/blog">Journal</a> / ${esc(a.cat)}</div>
    <article style="max-width:780px">${head(a.cat, esc(a.title), a.read + ' min read')}
      ${a.body.map(([h, p]) => myth && h.startsWith('Myth') ? `<div class="card" style="margin-bottom:12px"><div class="alert avoid" style="margin-bottom:8px"><b>✕ ${esc(h.replace('Myth: ', 'Myth — '))}</b></div><div class="alert ok" style="margin:0"><b>✓ Fact</b>${esc(p.replace('Fact: ', ''))}</div></div>` : `<h3 class="mt">${esc(h)}</h3><p>${esc(p)}</p>`).join('')}
      <div class="alert info mt"><b>Note</b>General information only. Your dermatologist knows your skin best.</div>
      <h3 class="mt">Keep reading</h3><div class="grid g2">${ARTICLES.filter((x) => x.id !== id).slice(0, 2).map(articleCard).join('')}</div>
    </article>`;
  };

  /* ---------- remedies ---------- */
  let remFilter = 'all';
  pages.remedies = () => {
    const lab = { strong: ['lime', '✓ Evidence-based'], some: ['cyan', '◐ Some evidence'], limited: ['amber', '? Limited / anecdotal'], avoid: ['red', '✕ Avoid'] };
    return head('Learn', 'DIY & Home <span class="grad-text">Remedies</span>', 'Kitchen remedies, rated honestly. Every card is labelled with how much real evidence exists — and which ones can hurt you.') +
    `<div class="chip-group">${[['all', 'All'], ['strong', 'Evidence-based'], ['some', 'Some evidence'], ['limited', 'Limited'], ['avoid', 'Avoid']].map(([k, l]) => `<button class="chip ${remFilter === k ? 'on' : ''}" onclick="App.remFilter('${k}')">${l}</button>`).join('')}</div>
    <div class="grid g3 mt">${REMEDIES.filter((r) => remFilter === 'all' || r.evidence === remFilter).map((r) => `<div class="card fade-in" ${r.evidence === 'avoid' ? 'style="border-color:rgba(255,92,122,.4)"' : ''}><span class="pill ${lab[r.evidence][0]}">${lab[r.evidence][1]}</span><h3 style="margin-top:12px">${esc(r.name)}</h3><p class="small muted">For: ${esc(r.for)}</p><p class="small" style="margin:0">${esc(r.note)}</p></div>`).join('')}</div>
    <div class="alert caution mt"><b>Always patch test</b>"Natural" ingredients cause allergies too. Stop if you feel burning, itching or see redness. Never use DIY remedies on open wounds, active infections or near the eyes.</div>`;
  };

  /* ---------- videos ---------- */
  pages.videos = (id) => {
    const v = id && VIDEOS.find((x) => x.id === id);
    return head('Learn', 'Video <span class="grad-text">Tutorials</span>', 'Step-by-step technique guides. Tap a guide to follow along, or open matching videos on YouTube.') +
    (v ? `<div class="card glow-border fade-in" style="margin-bottom:24px"><div class="row between"><h2 style="margin:0">${v.icon} ${esc(v.title)}</h2><span class="pill">${v.dur}</span></div>
      <div class="grid g2 mt"><div class="thumb" style="--h:${v.hue};margin:0;font-size:4rem">${v.icon}<span class="play">▶</span></div>
      <div><ol>${v.steps.map((s) => `<li style="margin-bottom:8px">${esc(s)}</li>`).join('')}</ol>
      <a class="btn primary" target="_blank" rel="noopener" href="https://www.youtube.com/results?search_query=${encodeURIComponent(v.q)}">Watch on YouTube ↗</a></div></div></div>` : '') +
    `<div class="grid g3">${VIDEOS.map((x) => `<a class="card hover" href="#/videos/${x.id}"><div class="thumb" style="--h:${x.hue}">${x.icon}<span class="play">▶</span></div><h3>${esc(x.title)}</h3><p class="small muted" style="margin:0">${x.dur} · ${x.steps.length} steps</p></a>`).join('')}</div>`;
  };

  /* ---------- glossary ---------- */
  pages.glossary = () => head('Learn', '<span class="grad-text">Glossary</span>', 'Label-reading made easy.') +
    `<div class="card"><input type="search" placeholder="Search terms…" oninput="App.glossFilter(this.value)"></div>
    <div class="grid g2 mt" id="glossGrid">${GLOSSARY.sort((a, b) => a[0].localeCompare(b[0])).map(([t, d]) => `<div class="card" data-q="${esc((t + ' ' + d).toLowerCase())}"><h3 class="grad-text" style="display:inline-block">${esc(t)}</h3><p class="small" style="margin:0">${esc(d)}</p></div>`).join('')}</div>`;

  /* ---------- shop ---------- */
  let F = { cat: 'all', skin: '', concern: '', max: 1000, vegan: false, ff: false, q: '', sort: 'pop' };
  pages.shop = () => {
    let list = PRODUCTS.filter((p) => (F.cat === 'all' || p.cat === F.cat) && (!F.skin || p.skin.includes(F.skin)) && (!F.concern || p.concerns.includes(F.concern)) && p.price <= F.max && (!F.vegan || p.vegan) && (!F.ff || p.ff) && (!F.q || (p.name + p.desc + p.type).toLowerCase().includes(F.q.toLowerCase())));
    if (F.sort === 'low') list.sort((a, b) => a.price - b.price);
    if (F.sort === 'high') list.sort((a, b) => b.price - a.price);
    if (F.sort === 'rating') list.sort((a, b) => avgRating(b) - avgRating(a));
    const quizType = store.get('quiz', {}).skin?.type;
    return head('Store', 'The <span class="grad-text">Shop</span>', 'Filtered by what your skin actually needs. Demo store — no real payments.') +
    `<div class="shop-layout">
      <aside class="card filters">
        <div class="field"><label>Search</label><input type="search" value="${esc(F.q)}" placeholder="serum, sunscreen…" onchange="App.shop.f('q',this.value)"></div>
        <div class="field"><label>Category</label><div class="chip-group">${['all', 'skin', 'hair'].map((c) => `<button class="chip ${F.cat === c ? 'on' : ''}" onclick="App.shop.f('cat','${c}')">${c[0].toUpperCase() + c.slice(1)}</button>`).join('')}</div></div>
        <div class="field"><label>Skin / scalp type</label><select onchange="App.shop.f('skin',this.value)"><option value="">Any</option>${['oily', 'dry', 'combination', 'sensitive', 'normal', 'oilyScalp', 'normalScalp', 'dryScalp'].map((t) => `<option value="${t}" ${F.skin === t ? 'selected' : ''}>${typeLabel(t)}</option>`).join('')}</select>
          ${quizType && F.skin !== quizType ? `<button class="btn sm ghost mt" onclick="App.shop.f('skin','${quizType}')">Use my quiz result (${typeLabel(quizType)})</button>` : ''}</div>
        <div class="field"><label>Concern</label><select onchange="App.shop.f('concern',this.value)"><option value="">Any</option>${ALL_CONCERNS.map((c) => `<option value="${c.id}" ${F.concern === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}</select></div>
        <div class="field"><label>Budget: up to <b>${inr(F.max)}</b></label><input type="range" min="200" max="1000" step="50" value="${F.max}" onchange="App.shop.f('max',+this.value)"></div>
        <label class="check"><input type="checkbox" ${F.vegan ? 'checked' : ''} onchange="App.shop.f('vegan',this.checked)"> Vegan only</label>
        <label class="check"><input type="checkbox" ${F.ff ? 'checked' : ''} onchange="App.shop.f('ff',this.checked)"> Fragrance-free only</label>
        <button class="btn sm ghost mt" onclick="App.shop.reset()">Reset filters</button>
      </aside>
      <div>
        <div class="row between" style="margin-bottom:14px"><span class="muted small">${list.length} products</span>
          <select style="width:auto" onchange="App.shop.f('sort',this.value)">${[['pop', 'Featured'], ['rating', 'Top rated'], ['low', 'Price: low → high'], ['high', 'Price: high → low']].map(([v, l]) => `<option value="${v}" ${F.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="grid g3">${list.map(productCard).join('') || '<p class="muted">No products match. Try widening your filters.</p>'}</div>
        <div class="section"><span class="eyebrow">Bundles</span><h2>Starter kits</h2><div class="grid g2 mt">${BUNDLES.map(bundleCard).join('')}</div></div>
      </div>
    </div>`;
  };
  const shop = {
    f(k, v) { F[k] = v; render(); },
    reset() { F = { cat: 'all', skin: '', concern: '', max: 1000, vegan: false, ff: false, q: '', sort: 'pop' }; render(); },
  };

  let reviewFilter = '';
  pages.product = (id) => {
    const p = PROD[id]; if (!p) return pages.notFound();
    const reviews = productReviews(p);
    const types = [...new Set(reviews.map((r) => r.type))];
    const byType = types.map((t) => { const rs = reviews.filter((r) => r.type === t); return { t, n: rs.length, avg: rs.reduce((s, r) => s + r.rating, 0) / rs.length }; }).sort((a, b) => b.avg - a.avg);
    const shown = reviews.filter((r) => !reviewFilter || r.type === reviewFilter);
    const r = getRoutine();
    const mine = [...(r.am || []), ...(r.pm || [])].flatMap((s) => detectIngs(s.step + ' ' + s.product + ' ' + (PROD[s.pid]?.ingredients || []).join(' ')));
    const clashes = compatCheck([...new Set([...p.ingredients, ...mine])]).filter((c) => c.level === 'avoid' && (p.ingredients.includes(c.a) || p.ingredients.includes(c.b)) && !(p.ingredients.includes(c.a) && p.ingredients.includes(c.b)));
    const myType = store.get('quiz', {})[p.cat === 'skin' ? 'skin' : 'hair']?.type;
    const myStat = byType.find((b) => b.t === myType);
    return `<div class="crumbs"><a href="#/shop">Shop</a> / ${esc(p.type)}</div>
    <div class="grid g2" style="align-items:start">
      <div class="card"><div class="prod-img" style="--h:${p.hue};aspect-ratio:1;margin:0"><div class="bottle ${bottleClass(p)}" style="transform:scale(1.8)"></div></div></div>
      <div>
        <div class="row" style="gap:6px"><span class="pill cyan">${esc(p.type)}</span>${p.vegan ? '<span class="pill lime">Vegan</span>' : ''}${p.ff ? '<span class="pill">Fragrance-free</span>' : '<span class="pill amber">Contains fragrance</span>'}</div>
        <h1 style="font-size:2rem;margin-top:12px">${esc(p.name)}</h1>
        <div class="stars">${stars(avgRating(p))} <span class="muted small">${avgRating(p).toFixed(1)} · ${reviews.length} reviews</span></div>
        <p class="mt">${esc(p.desc)}</p>
        <div class="price" style="font-size:1.8rem">${inr(p.price)}</div>
        <div class="row mt"><button class="btn primary" onclick="App.cart.add('${p.id}')">Add to cart</button><button class="btn" onclick="App.wish.toggle('${p.id}')">${wish.has(p.id) ? '♥ Saved' : '♡ Wishlist'}</button></div>
        <h3 class="mt">Key ingredients</h3><div class="chip-group">${p.ingredients.map((i) => `<a class="pill mag" href="#/ingredients/${i}">${esc(ING[i]?.name || i)}</a>`).join('')}</div>
        <h3 class="mt">Best for</h3><div class="chip-group">${p.skin.map((t) => `<span class="pill">${typeLabel(t)}</span>`).join('')}${p.concerns.map((c) => `<a class="pill cyan" href="#/${concernById(c)?.area}/${c}">${esc(concernById(c)?.name)}</a>`).join('')}</div>
        ${clashes.length ? `<div class="mt"><div class="small muted" style="margin-bottom:6px">Checked against your saved routine:</div>${clashes.map(compatHTML).join('')}</div>` : ''}
        ${myStat ? `<div class="alert info mt"><b>People with your type (${typeLabel(myType)}) rated this ${myStat.avg.toFixed(1)}★</b>Based on ${myStat.n} reviews.</div>` : ''}
      </div>
    </div>
    <div class="section"><h2>Reviews by skin type</h2>
      <div class="grid g2">
        <div class="card">${byType.map((b) => `<div class="meter"><div class="row"><span>People with <b>${typeLabel(b.t).toLowerCase()}</b> ${p.cat === 'skin' ? 'skin ' : ''}rated this</span><span>${b.avg.toFixed(1)}★ <span class="muted small">(${b.n})</span></span></div><div class="bar"><i style="width:${(b.avg / 5) * 100}%"></i></div></div>`).join('')}</div>
        <div class="card"><h3>Write a review</h3>
          <form onsubmit="App.review(event,'${p.id}')">
            <div class="row"><select name="type" style="flex:1">${(p.cat === 'skin' ? ['oily', 'dry', 'combination', 'sensitive', 'normal'] : ['oilyScalp', 'normalScalp', 'dryScalp']).map((t) => `<option value="${t}" ${t === myType ? 'selected' : ''}>${typeLabel(t)}</option>`).join('')}</select>
            <select name="rating" style="width:100px">${[5, 4, 3, 2, 1].map((n) => `<option>${n}</option>`).join('')}</select></div>
            <textarea name="text" rows="3" class="mt" placeholder="How did it work for you?" required></textarea>
            <button class="btn sm primary mt">Post review</button>
          </form></div>
      </div>
      <div class="chip-group mt"><button class="chip ${!reviewFilter ? 'on' : ''}" onclick="App.revFilter('')">All</button>${types.map((t) => `<button class="chip ${reviewFilter === t ? 'on' : ''}" onclick="App.revFilter('${t}')">${typeLabel(t)}</button>`).join('')}</div>
      <div class="grid g3 mt">${shown.map((rv) => `<div class="card"><div class="row between"><span class="stars">${stars(rv.rating)}</span><span class="pill">${typeLabel(rv.type)}</span></div><p class="small mt" style="margin-bottom:0">${esc(rv.text)}</p>${rv.sample ? '<div class="small muted mt">Sample review (demo data)</div>' : '<div class="small" style="color:var(--lime);margin-top:8px">Your review</div>'}</div>`).join('')}</div>
    </div>`;
  };

  pages.cart = () => {
    const lines = cart.lines();
    if (!lines.length) return head('Store', 'Your <span class="grad-text">Cart</span>') + '<div class="card center"><p class="muted">Your cart is empty.</p><a class="btn primary" href="#/shop">Start shopping</a></div>';
    const sub = cart.total(), ship = sub >= 799 ? 0 : 49;
    return head('Store', 'Your <span class="grad-text">Cart</span>') +
    `<div class="grid" style="grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:24px" id="cartGrid">
      <div class="card"><div class="table-wrap"><table><thead><tr><th>Item</th><th>Price</th><th>Qty</th><th>Total</th></tr></thead><tbody>
        ${lines.map((l) => `<tr><td>${PROD[l.key] ? `<a href="#/product/${l.key}">${esc(l.name)}</a>` : esc(l.name)}</td><td>${inr(l.unit)}</td><td><div class="row" style="gap:4px;flex-wrap:nowrap"><button class="btn sm ghost" onclick="App.cart.setQty('${l.key}',${l.qty - 1})">−</button>${l.qty}<button class="btn sm ghost" onclick="App.cart.setQty('${l.key}',${l.qty + 1})">+</button></div></td><td>${inr(l.unit * l.qty)}</td></tr>`).join('')}
      </tbody></table></div></div>
      <div class="card"><h3>Summary</h3>
        <div class="row between"><span>Subtotal</span><span>${inr(sub)}</span></div>
        <div class="row between"><span>Shipping</span><span>${ship ? inr(ship) : 'Free'}</span></div>
        ${ship ? `<div class="small muted">Add ${inr(799 - sub)} more for free shipping</div>` : ''}
        <hr style="border-color:var(--line)"><div class="row between"><b>Total</b><b class="price">${inr(sub + ship)}</b></div>
        <a class="btn primary mt" style="width:100%" href="#/checkout">Checkout →</a>
      </div>
    </div><style>@media(max-width:860px){#cartGrid{grid-template-columns:1fr!important}}</style>`;
  };

  pages.wishlist = () => {
    const w = wish.get().map((id) => PROD[id]).filter(Boolean);
    return head('Store', 'Your <span class="grad-text">Wishlist</span>') + (w.length ? `<div class="grid g4">${w.map(productCard).join('')}</div>` : '<div class="card center"><p class="muted">Nothing saved yet. Tap ♡ on any product.</p><a class="btn primary" href="#/shop">Browse products</a></div>');
  };

  pages.checkout = () => {
    const lines = cart.lines(); if (!lines.length) { setTimeout(() => go('#/cart')); return ''; }
    const sub = cart.total(), ship = sub >= 799 ? 0 : 49;
    const prof = store.get('profile', {});
    return head('Store', '<span class="grad-text">Checkout</span>', 'Demo checkout — no money is charged.') +
    `<form class="grid" style="grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:24px" id="coGrid" onsubmit="App.placeOrder(event)">
      <div class="card"><h3>Shipping</h3>
        <div class="grid g2"><div class="field"><label>Full name</label><input name="name" type="text" required value="${esc(prof.name || '')}"></div><div class="field"><label>Phone</label><input name="phone" type="tel" pattern="[0-9+ ]{10,14}" required></div></div>
        <div class="field"><label>Address</label><textarea name="addr" rows="2" required></textarea></div>
        <div class="grid g3"><div class="field"><label>City</label><input name="city" type="text" required></div><div class="field"><label>State</label><input name="state" type="text" required></div><div class="field"><label>PIN code</label><input name="pin" type="text" pattern="[1-9][0-9]{5}" required title="6-digit PIN"></div></div>
        <h3 class="mt">Payment</h3>
        ${[['upi', 'UPI', 'GPay, PhonePe, Paytm, BHIM'], ['razorpay', 'Razorpay', 'Cards, netbanking, wallets, UPI'], ['cod', 'Cash on delivery', '+₹30 handling']].map(([v, l, d], i) => `<label class="check card" style="padding:14px;margin-bottom:8px"><input type="radio" name="pay" value="${v}" ${i === 0 ? 'checked' : ''} onchange="document.getElementById('upiBox').classList.toggle('hidden', this.value!=='upi')"><span><b>${l}</b><br><span class="small muted">${d}</span></span></label>`).join('')}
        <div id="upiBox" class="field"><label>UPI ID</label><input name="upi" type="text" placeholder="yourname@okbank" pattern="[a-zA-Z0-9.\\-_]{2,}@[a-zA-Z]{2,}"></div>
      </div>
      <div class="card"><h3>Order</h3>${lines.map((l) => `<div class="row between small"><span>${esc(l.name)} × ${l.qty}</span><span>${inr(l.unit * l.qty)}</span></div>`).join('')}
        <hr style="border-color:var(--line)"><div class="row between"><span>Shipping</span><span>${ship ? inr(ship) : 'Free'}</span></div>
        <div class="row between"><b>Total</b><b class="price">${inr(sub + ship)}</b></div>
        <button class="btn primary mt" style="width:100%">Place order</button>
        <p class="small muted mt">🔒 This is a demo. To accept real payments, plug a Razorpay key into <span class="kbd">App.placeOrder</span> (see README).</p></div>
    </form><style>@media(max-width:860px){#coGrid{grid-template-columns:1fr!important}}</style>`;
  };
  function placeOrder(e) {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    const lines = cart.lines(), sub = cart.total(), total = sub + (sub >= 799 ? 0 : 49) + (fd.pay === 'cod' ? 30 : 0);
    // Real integration point: create an order on your server, then open Razorpay Checkout / UPI intent here.
    const order = { id: 'AURA' + Date.now().toString().slice(-6), date: today(), items: lines.map((l) => ({ name: l.name, qty: l.qty })), total, pay: fd.pay, city: fd.city };
    const orders = store.get('orders', []); orders.unshift(order); store.set('orders', orders);
    store.set('cart', {}); badges();
    $('#app').innerHTML = `<div class="card center glow-border fade-in" style="max-width:560px;margin:40px auto"><div class="ico" style="margin:0 auto 14px">✓</div><h2>Order placed</h2><p class="muted">Order <b>${order.id}</b> · ${inr(total)} via ${fd.pay.toUpperCase()}</p><p class="small muted">Demo mode: no payment was taken and nothing will ship.</p><div class="row" style="justify-content:center"><a class="btn primary" href="#/account">View orders</a><a class="btn" href="#/shop">Keep shopping</a></div></div>`;
  }

  /* ---------- clinic ---------- */
  let clinicTab;
  let booking = { service: SERVICES[0].name, expert: 'e1', date: null, slot: null };
  pages.clinic = (tab) => {
    clinicTab = tab || 'services';
    const tabs = [['services', 'Services & prices'], ['book', 'Book appointment'], ['experts', 'Our experts'], ['gallery', 'Before / after'], ['consult', 'Online consultation']];
    let body = '';
    if (clinicTab === 'services') {
      const cats = [...new Set(SERVICES.map((s) => s.cat))];
      body = cats.map((c) => `<h3 class="mt">${c}</h3><div class="card" style="padding:6px 0"><div class="table-wrap"><table><tbody>${SERVICES.filter((s) => s.cat === c).map((s) => `<tr><td>${esc(s.name)}</td><td class="muted small">${s.dur}</td><td class="price" style="font-size:1rem">${inr(s.price)}</td><td style="text-align:right"><button class="btn sm" onclick="App.clinic.bookService('${esc(s.name)}')">Book</button></td></tr>`).join('')}</tbody></table></div></div>`).join('');
    } else if (clinicTab === 'book') body = bookingUI();
    else if (clinicTab === 'experts') {
      body = `<div class="grid g3">${EXPERTS.map((e) => `<div class="card hover"><div class="row"><div class="avatar" style="--h:${e.hue}">${e.initials}</div><div><h3 style="margin:0">${esc(e.name)}</h3><div class="small muted">${esc(e.role)}</div></div></div><p class="small mt">${e.exp} years experience</p><div class="chip-group">${e.focus.map((f) => `<span class="pill cyan">${f}</span>`).join('')}</div><button class="btn sm primary mt" onclick="App.clinic.bookExpert('${e.id}')">Book with ${esc(e.name.split(' ').slice(-1)[0])}</button></div>`).join('')}</div><p class="small muted mt">Sample profiles for this personal demo — replace with your real clinic team.</p>`;
    } else if (clinicTab === 'gallery') {
      const cases = [['Acne · 12 weeks', 'Salicylic acid + adapalene, 3 cleanups', 15], ['Pigmentation · 16 weeks', 'Azelaic acid, sunscreen, 4 peels', 30], ['Scalp · 8 weeks', 'Ketoconazole regimen', 200]];
      body = `<div class="alert info"><b>Shared with consent</b>Real patient photos are only published with written, revocable consent and faces cropped or blurred. The visuals below are illustrative placeholders.</div>
      <div class="grid g3 mt">${cases.map(([t, d, h], k) => `<div class="card"><div class="ba" style="--pos:50%">
        <div class="layer" style="background:${baBefore(h, k)}"></div><div class="layer after" style="background:${baAfter(h)}"></div>
        <span class="lbl" style="left:10px">Before</span><span class="lbl" style="right:10px">After</span><div class="handle"></div>
        <input type="range" min="0" max="100" value="50" oninput="this.parentElement.style.setProperty('--pos',this.value+'%')" aria-label="Compare before and after"></div>
        <h3 class="mt" style="margin-bottom:4px">${t}</h3><p class="small muted" style="margin:0">${d}</p><div class="small mt"><span class="pill lime">✓ Consent on file</span></div></div>`).join('')}</div>`;
    } else if (clinicTab === 'consult') {
      body = `<form class="card" style="max-width:760px" onsubmit="App.clinic.consult(event)">
        <div class="grid g2"><div class="field"><label>Name</label><input name="name" type="text" required></div><div class="field"><label>Age</label><input name="age" type="number" min="12" max="100" required></div></div>
        <div class="grid g2"><div class="field"><label>Email or phone</label><input name="contact" type="text" required></div><div class="field"><label>Main concern</label><select name="concern">${ALL_CONCERNS.map((c) => `<option>${c.name}</option>`).join('')}<option>Other</option></select></div></div>
        <div class="field"><label>How long have you had it?</label><select name="dur"><option>Less than 2 weeks</option><option>2 weeks – 3 months</option><option>3–12 months</option><option>Over a year</option></select></div>
        <div class="field"><label>Describe your symptoms</label><textarea name="desc" rows="4" required placeholder="What you see, what makes it better or worse…"></textarea></div>
        <div class="field"><label>Current products / medicines / allergies</label><textarea name="meds" rows="2"></textarea></div>
        <div class="field"><label>Photos (optional)</label><input type="file" name="photos" accept="image/*" multiple><div class="small muted">Photos stay in your browser in this demo.</div></div>
        <label class="check"><input type="checkbox" required> I understand this is not an emergency service. For severe reactions, swelling of the face/lips or difficulty breathing, I will go to the nearest emergency department.</label>
        <label class="check mt"><input type="checkbox" required> I consent to my information being used for this consultation as described in the <a href="#/privacy">privacy policy</a>.</label>
        <div id="consultFlag"></div>
        <button class="btn primary mt">Request consultation</button></form>`;
    }
    return head('Clinic & Salon', 'Care, <span class="grad-text">booked in seconds</span>', 'Dermatology, trichology and salon services. Pick a slot, meet the team, or start an online consult.') +
      `<div class="tabs">${tabs.map(([k, l]) => `<button class="${clinicTab === k ? 'on' : ''}" onclick="App.clinic.tab('${k}')">${l}</button>`).join('')}</div>${body}${upcomingAppts()}`;
  };
  const baBefore = (h, k) => `radial-gradient(circle at ${30 + k * 10}% 40%, hsla(${h ? h : 0},70%,35%,.9) 0 6px, transparent 7px), radial-gradient(circle at 60% 55%, hsla(${h},70%,35%,.9) 0 5px, transparent 6px), radial-gradient(circle at 45% 70%, hsla(${h},70%,35%,.85) 0 7px, transparent 8px), radial-gradient(circle at 70% 30%, hsla(${h},70%,35%,.8) 0 4px, transparent 5px), radial-gradient(circle at 25% 65%, hsla(${h},70%,35%,.8) 0 5px, transparent 6px), radial-gradient(ellipse at 50% 50%, #c58f6b, #8a5a3f)`;
  const baAfter = () => `radial-gradient(circle at 45% 70%, rgba(120,70,50,.25) 0 6px, transparent 7px), radial-gradient(ellipse at 50% 45%, #d9a27c, #9a6748)`;
  function slotsFor(date, expert) {
    const r = rng(hash(date + expert)), out = [];
    for (let h = 10; h < 19; h++) for (const m of ['00', '30']) out.push({ t: `${String(h).padStart(2, '0')}:${m}`, taken: r() < 0.3 });
    const mine = store.get('appts', []).filter((a) => a.date === date && a.expert === expert).map((a) => a.slot);
    return out.map((s) => ({ ...s, taken: s.taken || mine.includes(s.t) }));
  }
  function bookingUI() {
    const days = [];
    for (let i = 0; i < 14; i++) { const d = new Date(); d.setDate(d.getDate() + i); days.push(d); }
    const ex = EXPERTS.find((e) => e.id === booking.expert);
    return `<div class="grid" style="grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:24px" id="bookGrid">
      <div class="card">
        <div class="grid g2"><div class="field"><label>Service</label><select onchange="App.clinic.set('service',this.value)">${SERVICES.map((s) => `<option ${booking.service === s.name ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Expert</label><select onchange="App.clinic.set('expert',this.value)">${EXPERTS.map((e) => `<option value="${e.id}" ${booking.expert === e.id ? 'selected' : ''}>${esc(e.name)} — ${esc(e.role)}</option>`).join('')}</select></div></div>
        <label>Pick a date</label>
        <div class="cal">${days.map((d) => { const iso = d.toISOString().slice(0, 10); return `<button ${d.getDay() === 0 ? 'disabled title="Closed Sundays"' : ''} class="${booking.date === iso ? 'on' : ''}" onclick="App.clinic.set('date','${iso}')">${d.toLocaleDateString('en-IN', { weekday: 'short' })}<b>${d.getDate()}</b>${d.toLocaleDateString('en-IN', { month: 'short' })}</button>`; }).join('')}</div>
        ${booking.date ? `<label class="mt" style="margin-top:18px">Available slots</label><div class="slots">${slotsFor(booking.date, booking.expert).map((s) => `<button class="slot ${booking.slot === s.t ? 'on' : ''}" ${s.taken ? 'disabled' : ''} onclick="App.clinic.set('slot','${s.t}')">${s.t}</button>`).join('')}</div>` : '<p class="small muted mt">Select a date to see open slots.</p>'}
      </div>
      <form class="card" onsubmit="App.clinic.confirm(event)"><h3>Summary</h3>
        <div class="row" style="margin-bottom:12px"><div class="avatar" style="--h:${ex.hue};width:48px;height:48px;font-size:.9rem">${ex.initials}</div><div><b>${esc(ex.name)}</b><div class="small muted">${esc(ex.role)}</div></div></div>
        <div class="small"><b>Service:</b> ${esc(booking.service)}</div>
        <div class="small"><b>Fee:</b> ${inr(SERVICES.find((s) => s.name === booking.service)?.price || 0)}</div>
        <div class="small"><b>When:</b> ${booking.date && booking.slot ? new Date(booking.date).toDateString() + ' · ' + booking.slot : '—'}</div>
        <div class="field mt"><label>Your name</label><input name="name" type="text" required value="${esc(store.get('profile', {}).name || '')}"></div>
        <div class="field"><label>Phone</label><input name="phone" type="tel" required pattern="[0-9+ ]{10,14}"></div>
        <button class="btn primary" style="width:100%" ${booking.date && booking.slot ? '' : 'disabled'}>Confirm booking</button>
        <p class="small muted mt">Pay at the clinic. Free cancellation up to 4 hours before.</p>
      </form>
    </div><style>@media(max-width:860px){#bookGrid{grid-template-columns:1fr!important}}</style>`;
  }
  function upcomingAppts() {
    const a = store.get('appts', []).filter((x) => x.date >= today());
    if (!a.length) return '';
    return `<div class="section"><h3>Your upcoming appointments</h3>${a.map((x) => `<div class="card row between" style="margin-bottom:8px;padding:14px 18px"><div><b>${esc(x.service)}</b><div class="small muted">${new Date(x.date).toDateString()} · ${x.slot} · ${esc(EXPERTS.find((e) => e.id === x.expert)?.name)}</div></div><button class="btn sm danger" onclick="App.clinic.cancel('${x.id}')">Cancel</button></div>`).join('')}</div>`;
  }
  const RED_FLAGS = /(bleed|changing mole|mole.*(chang|grow|bigger|itch)|sudden(ly)? .*hair (loss|fall)|clumps|bald patch|swell|blister|difficulty breathing|can'?t breathe|fever|spreading|\bpus\b|severe pain|eyes? (pain|swelling|vision))/i;
  const clinicApi = {
    tab(t) { go('#/clinic/' + t); },
    set(k, v) { booking[k] = v; if (k !== 'slot') booking.slot = k === 'date' ? null : booking.slot; if (k === 'expert') booking.slot = null; render(); },
    bookService(s) { booking.service = s; go('#/clinic/book'); },
    bookExpert(e) { booking.expert = e; booking.slot = null; go('#/clinic/book'); },
    confirm(e) {
      e.preventDefault(); const fd = Object.fromEntries(new FormData(e.target));
      const a = store.get('appts', []); a.push({ id: uid(), ...booking, name: fd.name, phone: fd.phone }); store.set('appts', a);
      toast(`Booked: ${booking.slot} on ${new Date(booking.date).toDateString()}`); booking.slot = null; render();
    },
    cancel(id) { askConfirm('Cancel this appointment?', () => { store.set('appts', store.get('appts', []).filter((a) => a.id !== id)); render(); }, 'Cancel appointment'); },
    consult(e) {
      e.preventDefault(); const fd = new FormData(e.target); const data = Object.fromEntries(fd); delete data.photos;
      const c = store.get('consults', []); c.unshift({ id: uid(), date: today(), ...data }); store.set('consults', c);
      const flag = RED_FLAGS.test(data.desc || '');
      e.target.innerHTML = `<div class="center"><div class="ico" style="margin:0 auto 12px">✓</div><h3>Request received</h3><p class="muted">In a live deployment this is sent securely to the clinic, and a doctor replies within 24 hours.</p>
        ${flag ? '<div class="alert avoid" style="text-align:left"><b>Some of what you described should be seen in person soon.</b>Bleeding or changing moles, sudden hair loss, swelling, blistering, fever or eye involvement need prompt in-person care. If symptoms are severe, go to the nearest emergency department.</div>' : ''}
        <a class="btn" href="#/account">View in account</a></div>`;
    },
  };

  /* ---------- AI skin analysis (on-device heuristics) ---------- */
  let lastScan = null;
  pages.analyze = () => head('AI Lab', 'Skin <span class="grad-text">Scan</span>', 'Upload a clear, front-facing photo in natural daylight, no makeup. Analysis runs entirely in your browser — the image is never uploaded.') +
    `<div class="grid" style="grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:24px" id="scanGrid">
      <div class="card">
        <label class="drop" id="drop"><input type="file" accept="image/*" id="scanFile" hidden><div class="ico" style="margin:0 auto 10px">⇪</div><b>Drop a photo or tap to upload</b><div class="small muted">JPG / PNG · face centred · even light</div></label>
        <div class="scan mt hidden" id="scanBox"><canvas id="scanCanvas"></canvas></div>
        <div class="row mt hidden" id="overlayCtl"><span class="small muted">Overlay:</span>${[['none', 'Off'], ['shine', 'Shine'], ['red', 'Redness'], ['spots', 'Spots']].map(([k, l]) => `<button class="chip" onclick="App.scan.overlay('${k}')">${l}</button>`).join('')}</div>
      </div>
      <div id="scanResult" class="card"><h3>How it works</h3><ul class="clean small">
        <li>Detects skin-coloured pixels (YCbCr colour model).</li><li><b>Shine</b>: bright, low-saturation specular highlights → oiliness.</li>
        <li><b>Redness</b>: pixels with a high red-vs-green ratio → inflammation/acne.</li><li><b>Spots & tone</b>: pixels much darker than their surroundings → pigmentation.</li></ul>
        <div class="alert caution"><b>Heuristic demo, not a diagnosis</b>Lighting and camera affect results. A trained CNN can be plugged in via <span class="kbd">App.scan.model</span> — see README.</div></div>
    </div><style>@media(max-width:860px){#scanGrid{grid-template-columns:1fr!important}}</style>`;
  function loadImage(file) {
    return new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = URL.createObjectURL(file); });
  }
  function analyzePixels(ctx, w, h) {
    const { data } = ctx.getImageData(0, 0, w, h);
    const N = w * h, L = new Float32Array(N), skin = new Uint8Array(N);
    let skinN = 0;
    for (let i = 0; i < N; i++) {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      L[i] = 0.299 * r + 0.587 * g + 0.114 * b;
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b, cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      if (cb > 77 && cb < 130 && cr > 133 && cr < 180 && L[i] > 35) { skin[i] = 1; skinN++; }
    }
    // integral image for local mean (box blur)
    const I = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += L[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; } }
    const R = Math.max(6, Math.round(w / 30));
    const local = (x, y) => { const x0 = Math.max(0, x - R), y0 = Math.max(0, y - R), x1 = Math.min(w, x + R + 1), y1 = Math.min(h, y + R + 1);
      return (I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0]) / ((x1 - x0) * (y1 - y0)); };
    let sumL = 0, sumL2 = 0, sumRG = 0, sumRG2 = 0;
    for (let i = 0; i < N; i++) if (skin[i]) { sumL += L[i]; sumL2 += L[i] ** 2; const rg = data[i * 4] - data[i * 4 + 1]; sumRG += rg; sumRG2 += rg * rg; }
    const mL = sumL / skinN, sdL = Math.sqrt(sumL2 / skinN - mL * mL), mRG = sumRG / skinN, sdRG = Math.sqrt(sumRG2 / skinN - mRG * mRG);
    const masks = { shine: new Uint8Array(N), red: new Uint8Array(N), spots: new Uint8Array(N) };
    let shine = 0, red = 0, spots = 0, toneVar = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (!skin[i]) continue;
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx ? (mx - mn) / mx : 0;
      if (L[i] > mL + 1.6 * sdL && sat < 0.3) { masks.shine[i] = 1; shine++; }
      if (r - g > mRG + 1.5 * sdRG && r > 90) { masks.red[i] = 1; red++; }
      const lm = local(x, y); toneVar += Math.abs(L[i] - lm);
      if (L[i] < lm * 0.86) { masks.spots[i] = 1; spots++; }
    }
    const pct = (n, k) => Math.max(0, Math.min(100, Math.round((n / skinN) * k)));
    return {
      coverage: skinN / N, masks,
      scores: { shine: pct(shine, 1500), redness: pct(red, 2500), spots: pct(spots, 2000), evenness: Math.max(0, Math.min(100, Math.round(100 - (toneVar / skinN) * 7))) },
    };
  }
  const scan = {
    model: null, // optional async (canvas) => ({shine, redness, spots, evenness}) e.g. a TF.js CNN
    async run(file) {
      if (!file || !file.type.startsWith('image/')) return toast('Please choose an image');
      const img = await loadImage(file);
      const cv = $('#scanCanvas'), W = Math.min(520, img.width), H = Math.round((img.height / img.width) * W);
      cv.width = W; cv.height = H; const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0, W, H);
      $('#scanBox').classList.remove('hidden'); $('#scanBox').classList.add('busy'); $('#drop').classList.add('hidden');
      await new Promise((r) => setTimeout(r, 900));
      const res = analyzePixels(ctx, W, H);
      if (scan.model) Object.assign(res.scores, await scan.model(cv));
      lastScan = { ...res, base: ctx.getImageData(0, 0, W, H), W, H };
      $('#scanBox').classList.remove('busy'); $('#overlayCtl').classList.remove('hidden');
      scan.report(res);
    },
    report(res) {
      const s = res.scores;
      if (res.coverage < 0.08) {
        $('#scanResult').innerHTML = `<h3>Couldn't find enough skin</h3><p class="muted">Try a closer, well-lit, front-facing photo without filters.</p><button class="btn" onclick="App.render()">Try again</button>`; return;
      }
      const g = (label, v, c, inv) => `<div><div class="gauge" style="--v:${v};--c:${c}"><span>${v}</span></div><div class="center small">${label}${inv ? '' : ''}</div></div>`;
      const recs = [];
      if (s.shine > 45) recs.push(['oily', 'Visible shine — a gel moisturizer and niacinamide can help balance oil.']);
      if (s.redness > 40) recs.push(['acne', 'Red areas detected — could be acne, irritation or sensitivity. Keep actives gentle.']);
      if (s.spots > 40 || s.evenness < 55) recs.push(['pigmentation', 'Uneven tone or dark spots — daily SPF and a brightening active may help.']);
      if (!recs.length) recs.push(['sun-care', 'Nothing stands out — keep protecting with daily sunscreen.']);
      $('#scanResult').innerHTML = `<h3>Scan result</h3><div class="grid" style="grid-template-columns:1fr 1fr">${g('Shine / oiliness', s.shine, 'var(--cyan)')}${g('Redness', s.redness, 'var(--red)')}${g('Dark spots', s.spots, 'var(--magenta)')}${g('Tone evenness', s.evenness, 'var(--lime)')}</div>
        <h3 class="mt">Suggestions</h3>${recs.map(([c, t]) => `<div class="alert info">${esc(t)} <a href="#/skin/${c}">Guide →</a></div>`).join('')}
        <div class="row mt"><button class="btn sm primary" onclick="App.scan.toProgress()">Save to progress tracker</button><button class="btn sm" onclick="App.render()">New scan</button></div>
        ${dermBox(['A mole or spot that is changing, bleeding, or looks different from your others', 'Painful, deep or scarring acne', 'A rash that is spreading, blistering or with fever'], 'Scans cannot see everything — see a dermatologist if…')}`;
    },
    overlay(k) {
      if (!lastScan) return; const cv = $('#scanCanvas'), ctx = cv.getContext('2d'); ctx.putImageData(lastScan.base, 0, 0);
      if (k === 'none') return;
      const m = lastScan.masks[k], col = { shine: [60, 240, 255], red: [255, 60, 90], spots: [255, 79, 216] }[k];
      const im = ctx.getImageData(0, 0, lastScan.W, lastScan.H);
      for (let i = 0; i < m.length; i++) if (m[i]) { im.data[i * 4] = col[0]; im.data[i * 4 + 1] = col[1]; im.data[i * 4 + 2] = col[2]; }
      ctx.putImageData(im, 0, 0);
    },
    toProgress() {
      if (!lastScan) return; const cv = $('#scanCanvas'), ctx = cv.getContext('2d'); ctx.putImageData(lastScan.base, 0, 0);
      addProgressEntry(downscale(cv), { ...lastScan.scores }, 'From skin scan', null);
      go('#/progress');
    },
  };
  function downscale(src, max = 260) {
    const w = src.width, h = src.height, k = Math.min(1, max / Math.max(w, h));
    const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.7);
  }

  /* ---------- progress tracker ---------- */
  let cmp = [];
  function addProgressEntry(img, scores, note, rating, date = today()) {
    const list = store.get('progress', []);
    list.push({ id: uid(), date, img, scores, note, rating });
    list.sort((a, b) => a.date.localeCompare(b.date));
    if (store.set('progress', list)) toast('Progress entry saved');
  }
  pages.progress = () => {
    const list = store.get('progress', []);
    const a = list.find((x) => x.id === cmp[0]), b = list.find((x) => x.id === cmp[1]);
    return head('AI Lab', 'Progress <span class="grad-text">Tracker</span>', 'Add one photo a week in the same spot, same light. Watch the trend lines instead of the mirror. Stored on this device only.') +
    `<div class="grid" style="grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);gap:24px" id="progGrid">
      <form class="card" onsubmit="App.progress.add(event)"><h3>New weekly check-in</h3>
        <div class="field"><label>Date</label><input type="date" name="date" value="${today()}" max="${today()}" required></div>
        <div class="field"><label>Photo</label><input type="file" name="photo" accept="image/*" required></div>
        <div class="field"><label>How does your skin/hair feel? <b id="rv">6</b>/10</label><input type="range" name="rating" min="1" max="10" value="6" oninput="document.getElementById('rv').textContent=this.value"></div>
        <div class="field"><label>Notes</label><input type="text" name="note" placeholder="Started retinol, less hair fall…"></div>
        <label class="check"><input type="checkbox" name="auto" checked> Run on-device skin scan on this photo</label>
        <button class="btn primary mt">Save check-in</button>
      </form>
      <div class="card"><h3>Trends</h3>${list.length >= 2 ? trendChart(list) : '<p class="muted">Add at least two check-ins to see a trend chart.</p>'}</div>
    </div>
    ${a && b ? `<div class="card mt glow-border"><div class="row between"><h3 style="margin:0">Compare: ${a.date} → ${b.date}</h3><button class="btn sm ghost" onclick="App.progress.cmpClear()">Close</button></div>
      <div class="ba mt" style="--pos:50%;max-width:520px;margin-inline:auto"><div class="layer"><img src="${a.img}" alt="Earlier"></div><div class="layer after"><img src="${b.img}" alt="Later"></div><span class="lbl" style="left:10px">${a.date}</span><span class="lbl" style="right:10px">${b.date}</span><div class="handle"></div>
      <input type="range" min="0" max="100" value="50" oninput="this.parentElement.style.setProperty('--pos',this.value+'%')"></div></div>` : ''}
    <div class="section"><div class="row between"><h2>Timeline</h2><span class="small muted">${list.length ? 'Tap two photos to compare' : ''}</span></div>
      <div class="grid g4 mt">${list.slice().reverse().map((e) => `<div class="card" style="padding:12px;${cmp.includes(e.id) ? 'border-color:var(--magenta)' : ''}">
        <img src="${e.img}" alt="Check-in ${e.date}" style="border-radius:10px;aspect-ratio:1;object-fit:cover;width:100%;cursor:pointer" onclick="App.progress.pick('${e.id}')">
        <div class="row between mt small"><b>${e.date}</b>${e.rating ? `<span class="pill cyan">${e.rating}/10</span>` : ''}</div>
        ${e.note ? `<div class="small muted">${esc(e.note)}</div>` : ''}
        ${e.scores ? `<div class="small muted">Red ${e.scores.redness} · Shine ${e.scores.shine} · Spots ${e.scores.spots}</div>` : ''}
        <button class="btn sm ghost mt" onclick="App.progress.del('${e.id}')">Delete</button></div>`).join('') || '<p class="muted">No check-ins yet.</p>'}</div></div>
    <style>@media(max-width:860px){#progGrid{grid-template-columns:1fr!important}}</style>`;
  };
  function trendChart(list) {
    const W = 560, H = 220, P = 30;
    const series = [['rating', 'Feel (×10)', '#b6ff5c', (e) => e.rating != null ? e.rating * 10 : null], ['redness', 'Redness', '#ff5c7a', (e) => e.scores?.redness], ['shine', 'Shine', '#3cf0ff', (e) => e.scores?.shine], ['spots', 'Spots', '#ff4fd8', (e) => e.scores?.spots]];
    const x = (i) => P + (i * (W - 2 * P)) / Math.max(1, list.length - 1), y = (v) => H - P - (v / 100) * (H - 2 * P);
    const lines = series.map(([k, l, c, f]) => {
      const pts = list.map((e, i) => [i, f(e)]).filter(([, v]) => v != null);
      if (pts.length < 2) return '';
      return `<polyline fill="none" stroke="${c}" stroke-width="2.5" points="${pts.map(([i, v]) => `${x(i)},${y(v)}`).join(' ')}"/>${pts.map(([i, v]) => `<circle cx="${x(i)}" cy="${y(v)}" r="3.5" fill="${c}"><title>${l}: ${v}</title></circle>`).join('')}`;
    }).join('');
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Progress trend">
      ${[0, 25, 50, 75, 100].map((v) => `<line x1="${P}" x2="${W - P}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(120,140,255,.15)"/><text x="4" y="${y(v) + 4}" fill="#8f97c4" font-size="10">${v}</text>`).join('')}
      ${list.map((e, i) => `<text x="${x(i)}" y="${H - 8}" fill="#8f97c4" font-size="9" text-anchor="middle">${e.date.slice(5)}</text>`).join('')}
      ${lines}</svg>
      <div class="row small">${series.map(([, l, c]) => `<span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${c}"></span> ${l}</span>`).join('')}</div>`;
  }
  const progress = {
    async add(e) {
      e.preventDefault(); const fd = new FormData(e.target), file = fd.get('photo');
      if (!file?.size) return;
      const img = await loadImage(file);
      const c = document.createElement('canvas'), W = Math.min(400, img.width); c.width = W; c.height = Math.round((img.height / img.width) * W);
      const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0, c.width, c.height);
      let scores = null;
      if (fd.get('auto')) { const r = analyzePixels(ctx, c.width, c.height); if (r.coverage >= 0.08) scores = r.scores; }
      addProgressEntry(downscale(c), scores, fd.get('note'), +fd.get('rating'), fd.get('date'));
      render();
    },
    pick(id) { cmp = cmp.includes(id) ? cmp.filter((x) => x !== id) : [...cmp, id].slice(-2); const l = store.get('progress', []); cmp.sort((a, b) => l.findIndex((x) => x.id === a) - l.findIndex((x) => x.id === b)); render(); },
    cmpClear() { cmp = []; render(); },
    del(id) { askConfirm('Delete this check-in?', () => { store.set('progress', store.get('progress', []).filter((x) => x.id !== id)); cmp = cmp.filter((x) => x !== id); render(); }); },
  };

  /* ---------- reminders ---------- */
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DEFAULT_REM = [
    { id: 'r1', label: 'Morning routine ☀', time: '07:30', days: [0, 1, 2, 3, 4, 5, 6], on: true },
    { id: 'r2', label: 'Night routine ☾', time: '22:00', days: [0, 1, 2, 3, 4, 5, 6], on: true },
    { id: 'r3', label: 'Hair mask / oiling', time: '10:00', days: [0], on: false },
  ];
  pages.reminders = () => {
    const rem = store.get('reminders', DEFAULT_REM), spf = store.get('spf', { on: false, every: 120, from: '09:00', to: '18:00' });
    const perm = 'Notification' in window ? Notification.permission : 'unsupported';
    return head('AI Lab', '<span class="grad-text">Reminders</span>', 'Never skip a step. Browser notifications fire while this site is open in a tab; add them to your phone calendar for reminders even when it is closed.') +
    `<div class="card row between"><div><b>Notifications:</b> <span class="pill ${perm === 'granted' ? 'lime' : 'amber'}">${perm}</span></div>${perm !== 'granted' && perm !== 'unsupported' ? '<button class="btn primary sm" onclick="App.rem.perm()">Enable notifications</button>' : '<button class="btn sm" onclick="App.rem.test()">Send test</button>'}</div>
    <div class="grid g2 mt">
      <div class="card"><h3>Routine reminders</h3>
        ${rem.map((r) => `<div class="step"><label class="check" style="margin:0"><input type="checkbox" ${r.on ? 'checked' : ''} onchange="App.rem.upd('${r.id}','on',this.checked)"></label>
          <div class="body"><b>${esc(r.label)}</b><div class="row" style="gap:4px;margin-top:6px">${DAYS.map((d, i) => `<button class="chip ${r.days.includes(i) ? 'on' : ''}" style="padding:2px 8px" onclick="App.rem.day('${r.id}',${i})">${d[0]}</button>`).join('')}</div></div>
          <input type="time" value="${r.time}" style="width:auto" onchange="App.rem.upd('${r.id}','time',this.value)">
          <div class="ctrl"><button title="Add to Google Calendar" onclick="App.rem.ics('${r.id}')">📅</button><button title="Delete" onclick="App.rem.del('${r.id}')">✕</button></div></div>`).join('')}
        <form class="row mt" onsubmit="App.rem.add(event)"><input name="label" type="text" placeholder="e.g. Retinol night" required style="flex:1;min-width:140px"><input name="time" type="time" value="21:30" style="width:auto"><button class="btn sm primary">Add</button></form>
      </div>
      <div class="card glow-border"><h3>☀ Sunscreen reapply</h3><p class="small muted">Reminds you every few hours during daylight — essential when UV is high.</p>
        <label class="check"><input type="checkbox" ${spf.on ? 'checked' : ''} onchange="App.rem.spf('on',this.checked)"> Enabled</label>
        <div class="grid g3 mt"><div><label>Every</label><select onchange="App.rem.spf('every',+this.value)">${[90, 120, 150, 180].map((m) => `<option value="${m}" ${spf.every === m ? 'selected' : ''}>${m / 60} h</option>`).join('')}</select></div>
          <div><label>From</label><input type="time" value="${spf.from}" onchange="App.rem.spf('from',this.value)"></div><div><label>To</label><input type="time" value="${spf.to}" onchange="App.rem.spf('to',this.value)"></div></div>
        <button class="btn sm mt" onclick="App.rem.ics('spf')">📅 Add to calendar</button>
      </div>
    </div>`;
  };
  function remTick() {
    const now = new Date(), hm = now.toTimeString().slice(0, 5), key = today() + ' ' + hm;
    const fired = store.get('remFired', '');
    if (fired === key) return;
    const due = [];
    store.get('reminders', DEFAULT_REM).forEach((r) => { if (r.on && r.time === hm && r.days.includes(now.getDay())) due.push(r.label); });
    const spf = store.get('spf', { on: false });
    if (spf.on && hm >= spf.from && hm <= spf.to) {
      const [fh, fm] = spf.from.split(':').map(Number); const mins = now.getHours() * 60 + now.getMinutes() - (fh * 60 + fm);
      if (mins > 0 && mins % spf.every === 0) due.push('Time to reapply sunscreen ☀');
    }
    if (!due.length) return;
    store.set('remFired', key);
    due.forEach((d) => { toast('⏰ ' + d); try { if ('Notification' in window && Notification.permission === 'granted') new Notification('AURA Lab', { body: d }); } catch {} });
  }
  function calLink(e) {
    const dt = (d) => d.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    const end = new Date(e.start.getTime() + 10 * 60e3);
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(e.title) + '&dates=' + dt(e.start) + '/' + dt(end) + '&recur=' + encodeURIComponent('RRULE:' + e.rrule) + '&details=' + encodeURIComponent('Reminder from AURA Lab');
  }
  function calDialog(events) {
    dialog(`<h3>Add to Google Calendar</h3><p class="small muted">Opens Google Calendar in a new tab with a repeating event. Your phone will then remind you even when this site is closed.</p>
      <div class="stack">${events.map((e) => `<a class="btn sm" target="_blank" rel="noopener" href="${calLink(e)}">📅 ${esc(e.title)} · ${e.start.toTimeString().slice(0, 5)}</a>`).join('')}</div>`);
  }
  const rem = {
    perm() { try { Notification.requestPermission().then(render, () => toast('Notifications are blocked here — use Add to calendar instead')); } catch { toast('Notifications are blocked here — use Add to calendar instead'); } },
    test() { toast('⏰ Test reminder'); try { if (Notification.permission === 'granted') new Notification('AURA Lab', { body: 'Reminders are working ✓' }); } catch {} },
    list: () => store.get('reminders', DEFAULT_REM),
    upd(id, k, v) { const l = rem.list(); const r = l.find((x) => x.id === id); r[k] = v; store.set('reminders', l); },
    day(id, d) { const l = rem.list(); const r = l.find((x) => x.id === id); r.days = r.days.includes(d) ? r.days.filter((x) => x !== d) : [...r.days, d].sort(); store.set('reminders', l); render(); },
    del(id) { store.set('reminders', rem.list().filter((x) => x.id !== id)); render(); },
    add(e) { e.preventDefault(); const fd = Object.fromEntries(new FormData(e.target)); const l = rem.list(); l.push({ id: uid(), label: fd.label, time: fd.time, days: [0, 1, 2, 3, 4, 5, 6], on: true }); store.set('reminders', l); render(); },
    spf(k, v) { const s = store.get('spf', { on: false, every: 120, from: '09:00', to: '18:00' }); s[k] = v; store.set('spf', s); },
    ics(id) {
      const mk = (hm) => { const d = new Date(); const [h, m] = hm.split(':'); d.setHours(+h, +m, 0, 0); if (d < new Date()) d.setDate(d.getDate() + 1); return d; };
      if (id === 'spf') {
        const s = store.get('spf', { every: 120, from: '09:00', to: '18:00' }); const ev = [];
        const [fh, fm] = s.from.split(':').map(Number), [th, tm] = s.to.split(':').map(Number);
        for (let t = fh * 60 + fm + s.every; t <= th * 60 + tm; t += s.every) ev.push({ start: mk(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`), title: 'Reapply sunscreen ☀', rrule: 'FREQ=DAILY' });
        return calDialog(ev);
      }
      const r = rem.list().find((x) => x.id === id);
      calDialog([{ start: mk(r.time), title: r.label, rrule: 'FREQ=WEEKLY;BYDAY=' + r.days.map((d) => ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][d]).join(',') }]);
    },
  };

  /* ---------- account ---------- */
  pages.account = () => {
    const prof = store.get('profile', {}), q = store.get('quiz', {}), r = getRoutine(), orders = store.get('orders', []), appts = store.get('appts', []), consults = store.get('consults', []), prog = store.get('progress', []);
    return head('Account', prof.name ? `Hi, <span class="grad-text">${esc(prof.name)}</span>` : 'Your <span class="grad-text">Account</span>', 'A local profile — your quiz results, routines and favourites are saved in this browser. No passwords, no servers.') +
    `<div class="grid g2">
      <form class="card" onsubmit="App.saveProfile(event)"><h3>Profile</h3>
        <div class="field"><label>Name</label><input name="name" type="text" value="${esc(prof.name || '')}"></div>
        <div class="field"><label>Email (optional)</label><input name="email" type="email" value="${esc(prof.email || '')}"></div>
        <div class="field"><label>City (for climate tips)</label><select name="city">${CITIES.map((c) => `<option ${climate.city === c.name ? 'selected' : ''}>${c.name}</option>`).join('')}</select></div>
        <button class="btn primary sm">Save</button></form>
      <div class="card"><h3>Quiz results</h3>
        ${q.skin ? `<p><span class="pill cyan">Skin</span> <b>${esc(q.skin.title)}</b> <span class="small muted">${q.skin.date}</span></p>` : '<p class="muted small">No skin result yet.</p>'}
        ${q.hair ? `<p><span class="pill mag">Hair</span> <b>${esc(q.hair.title)}</b> <span class="small muted">${q.hair.date}</span></p>` : '<p class="muted small">No hair result yet.</p>'}
        <a class="btn sm" href="#/quiz">${q.skin || q.hair ? 'Retake' : 'Take'} quiz</a></div>
      <div class="card"><h3>My routine</h3>
        <div class="small"><b>AM:</b> ${(r.am || []).map((s) => esc(s.step)).join(' → ') || '—'}</div>
        <div class="small mt"><b>PM:</b> ${(r.pm || []).map((s) => esc(s.step)).join(' → ') || '—'}</div>
        <a class="btn sm mt" href="#/routine">Edit routine</a></div>
      <div class="card"><h3>Favourites</h3>${wish.get().length ? `<div class="chip-group">${wish.get().map((id) => `<a class="pill mag" href="#/product/${id}">${esc(PROD[id]?.name)}</a>`).join('')}</div>` : '<p class="muted small">Nothing saved yet.</p>'}
        <p class="small muted mt">${prog.length} progress check-ins saved.</p></div>
      <div class="card"><h3>Orders</h3>${orders.length ? orders.map((o) => `<div class="small" style="margin-bottom:6px"><b>${o.id}</b> · ${o.date} · ${inr(o.total)} · ${o.pay.toUpperCase()}<div class="muted">${o.items.map((i) => esc(i.name) + ' ×' + i.qty).join(', ')}</div></div>`).join('') : '<p class="muted small">No orders yet.</p>'}</div>
      <div class="card"><h3>Appointments & consults</h3>${appts.map((a) => `<div class="small"><b>${esc(a.service)}</b> · ${a.date} ${a.slot}</div>`).join('') || '<p class="muted small">No appointments.</p>'}${consults.map((c) => `<div class="small mt"><span class="pill">Consult</span> ${esc(c.concern)} · ${c.date}</div>`).join('')}</div>
    </div>
    <div class="card mt"><h3>Your data</h3><p class="small muted">Everything is stored only in this browser. Export a backup, move it to another device, or wipe it.</p>
      <div class="row"><button class="btn sm" onclick="App.data.export()">Export backup</button><button class="btn sm" onclick="App.data.import()">Import</button><button class="btn sm danger" onclick="App.data.wipe()">Delete all my data</button></div></div>`;
  };
  const auraKeys = () => { try { return Object.keys(localStorage).filter((k) => k.startsWith('aura.')); } catch { return []; } };
  const data = {
    export() {
      const out = {}; auraKeys().forEach((k) => (out[k] = localStorage.getItem(k)));
      const txt = JSON.stringify(out);
      dialog(`<h3>Your backup</h3><p class="small muted">Copy this text and keep it somewhere safe (notes app, email to yourself). Paste it into Import on another device.</p><textarea id="exportBox" rows="8" readonly>${esc(txt)}</textarea>`,
        [{ label: 'Close', cls: 'ghost' }, { label: 'Copy backup', cls: 'primary', fn: () => { copyText(txt); return false; } }]);
    },
    import() {
      dialog(`<h3>Import backup</h3><p class="small muted">Paste your backup text, or choose a backup .json file.</p><textarea id="importBox" rows="8" placeholder='{"aura.profile": …}'></textarea><input type="file" id="importFile" accept="application/json" class="mt">`,
        [{ label: 'Cancel', cls: 'ghost' }, { label: 'Import', cls: 'primary', fn: () => { data.apply(); return false; } }]);
    },
    async apply() {
      try {
        const f = $('#importFile').files[0];
        const j = JSON.parse(f ? await f.text() : $('#importBox').value);
        Object.entries(j).forEach(([k, v]) => k.startsWith('aura.') && localStorage.setItem(k, v));
        $('#modal').classList.add('hidden'); toast('Data imported'); location.reload();
      } catch { toast('That backup could not be read. Paste the full text you copied.'); }
    },
    wipe() {
      askConfirm('Delete ALL your AURA Lab data on this device, including photos? This cannot be undone.', () => {
        auraKeys().forEach((k) => localStorage.removeItem(k)); toast('All data deleted'); location.reload();
      }, 'Delete everything');
    },
  };
  function saveProfile(e) {
    e.preventDefault(); const fd = Object.fromEntries(new FormData(e.target));
    store.set('profile', { name: fd.name, email: fd.email }); climate.city = fd.city; store.set('climate', climate); toast('Profile saved'); render();
  }

  /* ---------- info pages ---------- */
  pages.about = () => head('About', 'Built for <span class="grad-text">curious skin</span>', 'AURA Lab is a personal skin & hair knowledge base and toolkit — part reference, part lab notebook.') +
    `<div class="grid g3">${[['◎', 'Evidence first', 'Every ingredient and remedy carries an evidence label. If the science is thin, we say so.'], ['☀', 'Made for India', 'High UV, monsoon humidity, hard water, pollution and melanin-rich skin prone to pigmentation.'], ['🔒', 'Private by default', 'No sign-up, no tracking, no uploads. Your photos and routines stay on your device.']].map(([i, t, d]) => `<div class="card"><div class="ico">${i}</div><h3>${t}</h3><p class="muted small" style="margin:0">${d}</p></div>`).join('')}</div>
    <div class="card mt"><h3>Under the hood</h3><p class="small muted">Plain HTML, CSS and JavaScript — no frameworks, no build step. Hash-based routing, localStorage persistence, on-device canvas image analysis, the Open-Meteo API for live UV and humidity, and the Notifications API for reminders. Designed to be extended with a real CNN (TensorFlow.js) and a payment gateway (Razorpay).</p></div>`;

  pages.contact = () => head('Contact', 'Say <span class="grad-text">hello</span>', 'Questions, feedback or collaboration ideas.') +
    `<div class="grid g2"><form class="card" onsubmit="App.contactSend(event)">
      <div class="field"><label>Name</label><input name="name" type="text" required></div>
      <div class="field"><label>Email</label><input name="email" type="email" required></div>
      <div class="field"><label>Topic</label><select name="topic"><option>General</option><option>Product question</option><option>Clinic booking</option><option>Feedback</option></select></div>
      <div class="field"><label>Message</label><textarea name="msg" rows="5" required></textarea></div>
      <button class="btn primary">Send message</button></form>
      <div class="card"><h3>Clinic</h3><p class="muted small">Mon–Sat · 10:00–19:00<br>Closed Sundays</p><h3>Need medical help now?</h3><p class="small">For severe allergic reactions, facial swelling or breathing difficulty, call <b>112</b> or go to the nearest emergency department.</p><a class="btn sm" href="#/clinic/consult">Start an online consult</a></div></div>`;

  pages.faq = () => head('Help', 'Frequently <span class="grad-text">asked</span>') + FAQ.map(([q, a]) => `<details><summary>${esc(q)}</summary><p class="muted" style="margin:0">${esc(a)}</p></details>`).join('');

  pages.privacy = () => head('Legal', 'Privacy <span class="grad-text">Policy</span>', 'Last updated ' + new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })) +
    `<div class="card" style="max-width:820px">${[
      ['What we collect', 'Nothing is sent to any server we run. Your profile, quiz results, routines, wishlist, orders, appointments and progress photos are stored in your browser\'s localStorage on this device.'],
      ['Face & scalp photos', 'Photos used for the skin scan are processed on your device using the HTML canvas and are never uploaded. Progress photos are saved as small compressed thumbnails in localStorage, only if you choose to save them. They are not used to train any model.'],
      ['Third-party services', 'Live weather comes from Open-Meteo: when you request it, the city coordinates (or your rounded location, if you allow it) are sent to their API. Fonts load from Google Fonts. YouTube links open on YouTube and are subject to their policy.'],
      ['Consultation forms', 'In this personal demo, consultation details stay in your browser. In a live clinic deployment, they would be transmitted over HTTPS and stored only for your care, in line with India\'s Digital Personal Data Protection Act, 2023.'],
      ['Your control', 'Export or permanently delete all your data any time from the Account page. Clearing your browser data also removes it.'],
      ['Children', 'This site is not intended for children under 13. Users under 18 should use it with a parent or guardian.'],
      ['Contact', 'Questions about privacy? Use the contact page.'],
    ].map(([h, p]) => `<h3>${h}</h3><p class="muted">${p}</p>`).join('')}</div>`;

  pages.disclaimer = () => head('Legal', 'Medical <span class="grad-text">Disclaimer</span>') +
    `<div class="card" style="max-width:820px"><p><b>AURA Lab is not medical advice.</b> All content — articles, quiz results, routines, ingredient information, AI scan outputs and chatbot replies — is for general educational purposes only and is not a substitute for professional diagnosis or treatment.</p>
    <p class="muted">Always patch test new products. Stop using any product that causes burning, swelling, or a rash. Do not start, stop or change prescription medicines based on this site. Retinoids and some actives are not suitable during pregnancy or breastfeeding — consult your doctor.</p>
    ${dermBox(['A mole or spot that is new, changing in size, shape or colour, itching or bleeding', 'Sudden or patchy hair loss, or hair coming out in clumps', 'Severe, painful, cystic or scarring acne', 'A rash with fever, blisters, or that spreads quickly', 'Swelling of the face, lips or eyes after a product (seek urgent care)', 'Any skin problem that does not improve after 6–8 weeks of home care'])}</div>`;

  pages.notFound = () => `<div class="card center" style="max-width:520px;margin:60px auto"><h1 class="grad-text">404</h1><p class="muted">This page drifted out of orbit.</p><a class="btn primary" href="#/">Go home</a></div>`;

  /* ================= chatbot ================= */
  const chat = {
    started: false,
    toggle() { $('#chat').classList.toggle('hidden'); if (!chat.started) chat.init(); $('#chatInput').focus(); },
    open() { $('#chat').classList.remove('hidden'); if (!chat.started) chat.init(); },
    init() {
      chat.started = true;
      chat.say('bot', 'Hi! I\'m the AURA assistant. Ask me about ingredients, mixing actives, routines, or a concern like acne or hair fall.\n\nI\'m not a doctor — for anything serious, please see a dermatologist.');
      $('#chatSuggest').innerHTML = ['Can I mix retinol and AHA?', 'What does niacinamide do?', 'How much sunscreen?', 'Beginner routine', 'Hair fall tips'].map((s) => `<button class="chip" onclick="App.chat.ask(this.textContent)">${s}</button>`).join('');
      $('#chatForm').addEventListener('submit', (e) => { e.preventDefault(); const v = $('#chatInput').value.trim(); if (v) chat.ask(v); $('#chatInput').value = ''; });
    },
    say(who, content) {
      const d = document.createElement('div'); d.className = 'msg ' + who;
      if (who === 'me') d.textContent = content; else d.innerHTML = content;
      $('#chatMsgs').appendChild(d); $('#chatMsgs').scrollTop = 1e9;
    },
    ask(q) {
      chat.say('me', q);
      const typing = document.createElement('div'); typing.className = 'msg bot'; typing.textContent = '…'; $('#chatMsgs').appendChild(typing);
      setTimeout(() => { typing.remove(); chat.say('bot', chatAnswer(q)); }, 450);
    },
  };
  function chatAnswer(q) {
    const t = q.toLowerCase();
    if (RED_FLAGS.test(t)) return '⚠ <b>That sounds like something a doctor should see.</b> Changing or bleeding moles, sudden or patchy hair loss, swelling, blistering, fever or eye symptoms need an in-person check. For severe reactions or breathing difficulty, call 112.\n\n<a href="#/clinic/book">Book a dermatologist →</a>';
    if (/pregnan|breastfeed/.test(t)) return 'During pregnancy/breastfeeding, avoid retinoids (retinol, adapalene, tretinoin) and high-dose salicylic acid. Generally considered safer: azelaic acid, niacinamide, vitamin C, mineral sunscreen — but please confirm with your doctor.';
    const ings = detectIngs(t);
    if (ings.length >= 2 || (ings.length && /mix|together|combine|layer|with/.test(t) && ings.length >= 2)) {
      const res = compatCheck(ings);
      if (!res.length) return `No known conflict between ${ings.map((i) => ING[i].name).join(' and ')}. Patch test anything new. <a href="#/compat">Open checker →</a>`;
      return res.map((r) => `${r.level === 'avoid' ? '⛔' : r.level === 'caution' ? '⚠' : '✓'} <b>${ING[r.a].name} + ${ING[r.b].name}:</b> ${esc(r.why)}${r.fix !== '—' ? '\n→ ' + esc(r.fix) : ''}`).join('\n\n');
    }
    if (ings.length === 1) { const i = ING[ings[0]]; return `<b>${i.name}</b>${i.aka ? ' (' + esc(i.aka) + ')' : ''}: ${esc(i.does)}\n\n<b>Suits:</b> ${i.suits.join(', ')}\n<b>Use:</b> ${esc(i.use)}${i.avoid.length ? '\n<b>Don\'t layer with:</b> ' + i.avoid.map((a) => ING[a]?.name).join(', ') : ''}\n\n<a href="#/ingredients/${i.id}">Full profile →</a>`; }
    if (/how much sun|amount.*sun|sunscreen.*(much|amount|apply)|two finger/.test(t)) return 'Use about <b>¼ teaspoon for your face</b> — roughly two finger-lengths for face + neck. Reapply every 2–3 hours outdoors or after sweating. <a href="#/videos/v3">See the tutorial →</a>';
    if (/spf|pa\+|uva|uvb/.test(t)) return 'SPF measures UVB (burning) protection; PA+ to PA++++ measures UVA (tanning & aging). In India, pick SPF 30–50 with PA+++ or PA++++. <a href="#/blog/spf-guide">Read more →</a>';
    if (/order|layer|which first|sequence/.test(t)) return 'Layer thinnest → thickest:\n1. Cleanser\n2. Toner / essence\n3. Water-based serums (actives)\n4. Moisturizer\n5. Sunscreen (AM, always last)\nOils go after moisturizer at night.';
    if (/purg/.test(t)) return 'Purging = temporary breakouts when starting retinoids or acids, in your usual breakout spots, settling in 4–6 weeks. New spots in new areas, or itching/burning, is more likely irritation — stop the product.';
    if (/begin|start|basic|simple routine|routine/.test(t)) return 'Start simple:\n☀ AM: gentle cleanser → moisturizer → SPF 50\n☾ PM: cleanser → moisturizer\nAfter 2–4 weeks, add ONE active for your goal. <a href="#/quiz">Take the quiz</a> for a personal routine.';
    if (/skin type|which type|my type|what type/.test(t)) return 'Take the 7-question <a href="#/quiz">skin type quiz</a> — it gives you a type and a starter routine you can save.';
    if (/weather|humid|monsoon|winter|summer|uv index|climate/.test(t)) return 'Weather changes what your skin needs — gels in humidity, richer creams in dry air, strict SPF when UV is 8+. <a href="#/climate">Get live tips for your city →</a>';
    const g = GLOSSARY.find(([term]) => t.includes(term.toLowerCase().replace('++++', '')));
    if (g) return `<b>${esc(g[0])}:</b> ${esc(g[1])}`;
    const c = ALL_CONCERNS.find((x) => t.includes(x.name.toLowerCase()) || t.includes(x.id.replace('-', ' ')) || (x.id === 'hair-fall' && /hair ?loss|shedding|thinning/.test(t)) || (x.id === 'pigmentation' && /dark spot|dark circle|tan|melasma|marks/.test(t)) || (x.id === 'oily' && /oily|greasy|shine/.test(t)) || (x.id === 'dryness' && /dry|flaky/.test(t)) || (x.id === 'anti-aging' && /wrinkle|fine line|aging/.test(t)) || (x.id === 'acne' && /pimple|breakout|zit/.test(t)));
    if (c) return `<b>${c.name}</b>: ${esc(c.summary)}\n\n<b>Try:</b> ${c.tips.slice(0, 2).map(esc).join(' ')}\n\n<a href="#/${c.area}/${c.id}">Full guide →</a>`;
    if (/remed|diy|home|natural|lemon|turmeric|haldi|aloe/.test(t)) return 'Some home remedies help (aloe, oatmeal, cold compress), many are unproven, and some hurt (lemon juice, toothpaste, baking soda). <a href="#/remedies">See the evidence-rated list →</a>';
    if (/book|appointment|doctor|derma/.test(t)) return 'You can <a href="#/clinic/book">book an appointment</a> or <a href="#/clinic/consult">request an online consultation</a>.';
    if (/hi|hello|hey/.test(t)) return 'Hey! Try asking "what does azelaic acid do?" or "can I use vitamin C with benzoyl peroxide?"';
    return 'I\'m not sure about that one. I know about ingredients, mixing rules, routines, skin & hair concerns, sunscreen and the glossary. Try rephrasing — or browse the <a href="#/faq">FAQ</a>.';
  }

  /* ================= router ================= */
  const routes = [
    [/^\/?$/, () => pages.home()],
    [/^\/(skin|hair)$/, (m) => pages.area(m[1])],
    [/^\/(skin|hair)\/([\w-]+)$/, (m) => pages.concern(m[1], m[2])],
    [/^\/quiz$/, () => pages.quiz()],
    [/^\/routine$/, () => pages.routine()],
    [/^\/ingredients(?:\/([\w-]+))?$/, (m) => pages.ingredients(m[1])],
    [/^\/compat$/, () => pages.compat()],
    [/^\/climate$/, () => pages.climate()],
    [/^\/blog$/, () => pages.blog()],
    [/^\/blog\/([\w-]+)$/, (m) => pages.article(m[1])],
    [/^\/remedies$/, () => pages.remedies()],
    [/^\/videos(?:\/([\w-]+))?$/, (m) => pages.videos(m[1])],
    [/^\/glossary$/, () => pages.glossary()],
    [/^\/shop$/, () => pages.shop()],
    [/^\/product\/([\w-]+)$/, (m) => pages.product(m[1])],
    [/^\/cart$/, () => pages.cart()],
    [/^\/wishlist$/, () => pages.wishlist()],
    [/^\/checkout$/, () => pages.checkout()],
    [/^\/clinic(?:\/(\w+))?$/, (m) => pages.clinic(m[1])],
    [/^\/analyze$/, () => pages.analyze()],
    [/^\/progress$/, () => pages.progress()],
    [/^\/reminders$/, () => pages.reminders()],
    [/^\/account$/, () => pages.account()],
    [/^\/about$/, () => pages.about()],
    [/^\/contact$/, () => pages.contact()],
    [/^\/faq$/, () => pages.faq()],
    [/^\/privacy$/, () => pages.privacy()],
    [/^\/disclaimer$/, () => pages.disclaimer()],
  ];
  let lastPath = null;
  function render() {
    const path = route;
    let html = null;
    for (const [re, fn] of routes) { const m = path.match(re); if (m) { html = fn(m); break; } }
    const y = window.scrollY;
    $('#app').innerHTML = html ?? pages.notFound();
    if (path !== lastPath) {
      window.scrollTo(0, 0);
      if (!/^\/product\//.test(path)) reviewFilter = '';
      if (path !== '/quiz') quizState = null;
    } else window.scrollTo(0, y);
    lastPath = path;
    $('#navLinks').classList.remove('open');
    $$('.nav-links > a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + path));
    mount(path);
  }
  function mount(path) {
    if (path === '/analyze') {
      const drop = $('#drop'), fi = $('#scanFile');
      fi.addEventListener('change', () => scan.run(fi.files[0]));
      ['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
      ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
      drop.addEventListener('drop', (e) => { e.preventDefault(); scan.run(e.dataTransfer.files[0]); });
    }
    if (/^\/ingredients\/./.test(path)) $('#ingDetail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (path === '/climate' && !climateTried && (!climate.data || Date.now() - climate.data.at > 30 * 60e3)) { climateTried = true; climateApi.fetch(); }
  }

  function init() {
    $('#ddSkin').innerHTML = `<a href="#/skin">All skin concerns</a>` + CONCERNS.skin.map((c) => `<a href="#/skin/${c.id}">${c.icon} ${c.name}<small>${c.tag}</small></a>`).join('');
    $('#ddHair').innerHTML = `<a href="#/hair">All hair concerns</a>` + CONCERNS.hair.map((c) => `<a href="#/hair/${c.id}">${c.icon} ${c.name}<small>${c.tag}</small></a>`).join('');
    $('#yr').textContent = new Date().getFullYear();
    if (store.get('stripHidden', false)) $('#strip').classList.add('hidden');
    route = readHash();
    window.addEventListener('hashchange', () => { const h = readHash(); if (h !== route) go(h, false); });
    window.addEventListener('popstate', () => go(readHash(), false));
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="#"]'); if (!a) return;
      const h = a.getAttribute('href'); if (h === '#') return;
      e.preventDefault(); go(h);
    });
    $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') e.target.classList.add('hidden'); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#modal').classList.add('hidden'); });
    badges(); render();
    setInterval(remTick, 20000); remTick();
  }

  document.addEventListener('DOMContentLoaded', init);

  return {
    render, go, cart, wish, quiz, routine, loadRoutine, ing, compat, climate: climateApi, shop, clinic: clinicApi, scan, progress, rem, data, chat,
    placeOrder, saveProfile,
    dismissStrip() { $('#strip').classList.add('hidden'); store.set('stripHidden', true); },
    blogCat(c) { blogCat = c; render(); },
    remFilter(k) { remFilter = k; render(); },
    revFilter(t) { reviewFilter = t; render(); },
    glossFilter(q) { q = q.toLowerCase(); $$('#glossGrid > div').forEach((d) => d.classList.toggle('hidden', q && !d.dataset.q.includes(q))); },
    review(e, id) {
      e.preventDefault(); const fd = Object.fromEntries(new FormData(e.target));
      const l = store.get('reviews.' + id, []); l.unshift({ type: fd.type, rating: +fd.rating, text: fd.text }); store.set('reviews.' + id, l); toast('Review posted'); render();
    },
    contactSend(e) { e.preventDefault(); const m = store.get('messages', []); m.unshift({ ...Object.fromEntries(new FormData(e.target)), date: today() }); store.set('messages', m); e.target.reset(); toast('Message saved — thanks!'); },
  };
})();
