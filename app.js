/* EndSem Focus — personal end-semester study planner.
   Everything is stored locally in the browser (localStorage). */
(function () {
  'use strict';

  var PIN = '0945';
  var STORE_KEY = 'endsem-focus-v1';
  var UNLOCK_KEY = 'endsem-focus-unlocked';
  var LOCKOUT_KEY = 'endsem-focus-lockout';
  var MAX_ATTEMPTS = 5;
  var LOCKOUT_MS = 30000;
  var MILESTONES = [3, 7, 14, 21, 30, 45, 60, 90, 120, 180, 270, 365];
  var SPACED_GAPS = [1, 3, 7, 14];
  var PRIORITY_WEIGHT = { 1: 0.8, 2: 1, 3: 1.25 };
  var KIND_HINT = {
    numerical: 'Study theory + solve 5 numericals / examples',
    coding: 'Learn concept + write & run 2 programs',
    theory: 'Read + make short notes / mind-map'
  };

  /* ---------------- Date helpers (always LOCAL dates, never UTC) ---------------- */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function keyOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function todayKey() { return keyOf(new Date()); }
  function parts(k) { return k.split('-').map(Number); }
  function parseKey(k) { var p = parts(k); return new Date(p[0], p[1] - 1, p[2]); }
  function isKey(k) {
    if (typeof k !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(k)) return false;
    return keyOf(parseKey(k)) === k;
  }
  function dayNum(k) { var p = parts(k); return Math.round(Date.UTC(p[0], p[1] - 1, p[2]) / 86400000); }
  function diffDays(a, b) { return dayNum(b) - dayNum(a); } // b - a
  function addDays(k, n) {
    var p = parts(k);
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  function fmtDate(k, opts) {
    return parseKey(k).toLocaleDateString(undefined, opts || { weekday: 'short', day: 'numeric', month: 'short' });
  }

  /* ---------------- Small utils ---------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function clampInt(v, lo, hi, dflt) {
    var n = parseInt(v, 10);
    if (isNaN(n)) n = dflt;
    return Math.min(hi, Math.max(lo, n));
  }
  function hash(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------------- Storage ---------------- */
  var storageOk = true;
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { storageOk = false; return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { storageOk = false; return false; } }
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  function ssDel(k) { try { sessionStorage.removeItem(k); } catch (e) { /* ignore */ } }

  function defaultSettings() {
    return { examDate: '', revisionDays: 7, maxPerDay: 6, minPerDay: 3, threshold: 60, theme: 'auto' };
  }
  function defaultState() {
    return {
      version: 1,
      settings: defaultSettings(),
      subjects: clone(window.ES_DEFAULT_SUBJECTS),
      topicDone: {},
      days: {}
    };
  }

  // Repairs / fills in any missing or invalid fields so old or hand-edited data never crashes the app.
  function normalize(s) {
    var d = defaultState();
    if (!s || typeof s !== 'object') return d;
    var out = { version: 1 };
    var st = s.settings && typeof s.settings === 'object' ? s.settings : {};
    out.settings = {
      examDate: isKey(st.examDate) ? st.examDate : '',
      revisionDays: clampInt(st.revisionDays, 0, 30, 7),
      maxPerDay: clampInt(st.maxPerDay, 1, 20, 6),
      minPerDay: clampInt(st.minPerDay, 0, 20, 3),
      threshold: clampInt(st.threshold, 10, 100, 60),
      theme: ['auto', 'light', 'dark'].indexOf(st.theme) >= 0 ? st.theme : 'auto'
    };
    if (out.settings.minPerDay > out.settings.maxPerDay) out.settings.minPerDay = out.settings.maxPerDay;

    var given = Array.isArray(s.subjects) ? s.subjects : [];
    out.subjects = d.subjects.map(function (def) {
      var g = null;
      for (var i = 0; i < given.length; i++) if (given[i] && given[i].id === def.id) { g = given[i]; break; }
      if (!g) return def;
      return {
        id: def.id,
        name: typeof g.name === 'string' && g.name.trim() ? g.name.trim() : def.name,
        short: typeof g.short === 'string' && g.short.trim() ? g.short.trim().slice(0, 8) : def.short,
        color: /^#[0-9a-f]{6}$/i.test(g.color) ? g.color : def.color,
        kind: KIND_HINT[g.kind] ? g.kind : def.kind,
        priority: clampInt(g.priority, 1, 3, def.priority),
        examDate: isKey(g.examDate) ? g.examDate : '',
        syllabus: typeof g.syllabus === 'string' ? g.syllabus : def.syllabus
      };
    });

    out.topicDone = {};
    if (s.topicDone && typeof s.topicDone === 'object') {
      Object.keys(s.topicDone).forEach(function (k) { if (isKey(s.topicDone[k])) out.topicDone[k] = s.topicDone[k]; });
    }
    out.days = {};
    if (s.days && typeof s.days === 'object') {
      Object.keys(s.days).forEach(function (k) {
        var day = s.days[k];
        if (!isKey(k) || !day || !Array.isArray(day.tasks)) return;
        out.days[k] = {
          tasks: day.tasks.filter(function (t) { return t && typeof t.title === 'string'; }).map(function (t) {
            return {
              id: typeof t.id === 'string' ? t.id : uid(),
              key: typeof t.key === 'string' ? t.key : '',
              kind: typeof t.kind === 'string' ? t.kind : 'custom',
              subjectId: typeof t.subjectId === 'string' ? t.subjectId : '',
              topicId: typeof t.topicId === 'string' ? t.topicId : '',
              title: t.title,
              hint: typeof t.hint === 'string' ? t.hint : '',
              unit: typeof t.unit === 'string' ? t.unit : '',
              carried: !!t.carried,
              done: !!t.done
            };
          }),
          info: day.info && typeof day.info === 'object' ? day.info : {}
        };
      });
    }
    return out;
  }

  function load() {
    var raw = lsGet(STORE_KEY);
    if (!raw) return defaultState();
    try {
      return normalize(JSON.parse(raw));
    } catch (e) {
      // keep a copy (once), never silently lose data
      if (lsSet(STORE_KEY + '-corrupt-' + Date.now(), raw)) {
        try { localStorage.removeItem(STORE_KEY); } catch (e2) { /* ignore */ }
      }
      return defaultState();
    }
  }
  function save() {
    if (!lsSet(STORE_KEY, JSON.stringify(state))) toast('⚠️ Could not save — storage is full or blocked');
  }

  var state = load();

  /* ---------------- Syllabus parsing ---------------- */
  var UNIT_RE = /^(unit|module|chapter|part|section)\s*[-:.]?\s*([0-9]+|[ivxlc]+)\b/i;
  var BULLET_RE = /^([-*•·▪●○◦►➤]|\d{1,2}[.)]|\(?[a-z][.)])\s+/i;

  function parseSyllabus(subject) {
    var lines = String(subject.syllabus || '').split(/\r?\n/);
    var unit = 'General';
    var seen = {};
    var topics = [];
    lines.forEach(function (raw) {
      var line = raw.trim();
      if (!line) return;
      if (line.charAt(0) === '#') {
        unit = line.replace(/^#+\s*/, '').trim() || 'Unit';
        return;
      }
      if (UNIT_RE.test(line) && line.length <= 80) { unit = line; return; }
      line = line.replace(BULLET_RE, '').trim();
      if (!line) return;
      var base = subject.id + ':' + hash(unit.toLowerCase() + '|' + line.toLowerCase().replace(/\s+/g, ' '));
      var id = base, n = 2;
      while (seen[id]) id = base + '~' + (n++);
      seen[id] = true;
      topics.push({ id: id, subjectId: subject.id, unit: unit, title: line });
    });
    return topics;
  }

  // Turns a pasted paragraph-style syllabus into one-topic-per-line format.
  function smartFormat(text) {
    var out = [];
    String(text || '').split(/\r?\n/).forEach(function (raw) {
      var line = raw.trim();
      if (!line) return;
      if (line.charAt(0) === '#') { out.push('', line); return; }
      var m = line.match(UNIT_RE);
      if (m) {
        var rest = line.slice(m[0].length).replace(/^\s*[:.\-–—]\s*/, '');
        var head = (m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase()) + ' ' + m[2].toUpperCase();
        if ((rest.match(/[,;]/g) || []).length >= 1) {
          var sep = rest.search(/\s*[:–—]\s*|\s+-\s+/);
          var title = '';
          if (sep > 0 && sep < 60) {
            title = rest.slice(0, sep).trim();
            rest = rest.slice(sep).replace(/^\s*[:–—-]\s*/, '');
          }
          out.push('', '# ' + head + (title ? ': ' + title : ''));
          splitTopics(rest).forEach(function (t) { out.push(t); });
        } else {
          out.push('', '# ' + head + (rest ? ': ' + rest : ''));
        }
        return;
      }
      line = line.replace(BULLET_RE, '').trim();
      if ((line.match(/[,;]/g) || []).length >= 2) splitTopics(line).forEach(function (t) { out.push(t); });
      else if (line) out.push(line);
    });
    while (out.length && out[0] === '') out.shift();
    return out.join('\n');
  }
  function splitTopics(s) {
    return s.split(/[;,]|\.\s+/).map(function (t) { return t.replace(/\.$/, '').trim(); })
      .filter(function (t) { return t.length > 1; })
      .map(function (t) { return t.charAt(0).toUpperCase() + t.slice(1); });
  }

  function buildCtx(st) {
    var ctx = { subs: st.subjects, topicsBy: {}, topicById: {}, subById: {} };
    st.subjects.forEach(function (s) {
      ctx.subById[s.id] = s;
      var ts = parseSyllabus(s);
      ctx.topicsBy[s.id] = ts;
      ts.forEach(function (t) { ctx.topicById[t.id] = t; });
    });
    return ctx;
  }
  function unitsOf(topics) {
    var u = [];
    topics.forEach(function (t) { if (u.indexOf(t.unit) < 0) u.push(t.unit); });
    return u;
  }
  function examFor(s, st) {
    if (isKey(s.examDate)) return s.examDate;
    return isKey(st.settings.examDate) ? st.settings.examDate : '';
  }
  function hasAnyExam(st) {
    if (isKey(st.settings.examDate)) return true;
    return st.subjects.some(function (s) { return isKey(s.examDate); });
  }

  /* ---------------- Strategic planner ----------------
     For every subject: topics left ÷ study days left (exam date − revision window) = topics needed per day.
     Today's topic count is the sum of those needs (bounded by min/max per day), and topics are handed out
     to the subjects that are most "behind" (weighted by priority), so every subject finishes before its
     revision window. Inside the revision window the plan switches to unit revision + previous-year papers,
     and finished topics come back for spaced-repetition recall after 1, 3, 7 and 14 days. */
  function buildPlan(day, st, ctx, doneDates, lastSeen) {
    lastSeen = lastSeen || {};
    var S = st.settings;
    var R = S.revisionDays;
    var tasks = [];
    var info = { behind: false, needPerDay: 0, mode: 'study' };
    var active = [], revCands = [], upcoming = [];

    ctx.subs.forEach(function (s) {
      var exam = examFor(s, st);
      if (!exam) return;
      var dte = diffDays(day, exam);
      if (dte < 0) return;
      if (dte === 0) {
        tasks.push(mk('exam', s, null, 'Exam today: ' + s.name,
          'Only light revision of key points & formulas. Reach early, read every question carefully. You have got this! 💪'));
        return;
      }
      upcoming.push({ s: s, dte: dte });
      var pending = ctx.topicsBy[s.id].filter(function (t) { return !doneDates[t.id]; });
      var studyDays = dte - R;
      if (pending.length) {
        var days = studyDays >= 1 ? studyDays : dte;
        active.push({ s: s, pending: pending, need: pending.length / days, alloc: 0, crunch: studyDays < 1 });
      }
      if (dte <= R) revCands.push({ s: s, dte: dte });
    });

    // 1) New topics to study
    var studyTasks = [];
    if (active.length) {
      var totalPending = 0, totalNeed = 0;
      active.forEach(function (a) { totalPending += a.pending.length; totalNeed += a.need; });
      info.needPerDay = Math.round(totalNeed * 10) / 10;
      var N = Math.ceil(totalNeed - 1e-9);
      if (N > S.maxPerDay) { info.behind = true; N = S.maxPerDay; }
      N = Math.max(N, Math.min(S.minPerDay, totalPending));
      N = Math.min(N, totalPending);
      for (var i = 0; i < N; i++) {
        var best = null, bestScore = -1;
        active.forEach(function (a) {
          if (a.alloc >= a.pending.length) return;
          // subjects not touched for a few days get a boost so every subject keeps moving
          var gap = lastSeen[a.s.id] ? Math.min(7, Math.max(1, diffDays(lastSeen[a.s.id], day))) : 4;
          var score = a.need * (a.crunch ? 3 : 1) * (PRIORITY_WEIGHT[a.s.priority] || 1) * (1 + 0.35 * gap) / (a.alloc + 1);
          if (score > bestScore) { bestScore = score; best = a; }
        });
        if (!best) break;
        best.alloc++;
      }
      // interleave subjects so the list alternates
      var round = 0, added = true;
      while (added) {
        added = false;
        active.forEach(function (a) {
          if (round < a.alloc) {
            var t = a.pending[round];
            var tk = mk('study', a.s, t, t.title, KIND_HINT[a.s.kind] || KIND_HINT.theory);
            tk.unit = t.unit;
            studyTasks.push(tk);
            added = true;
          }
        });
        round++;
      }
    }

    // 2) Revision window: unit revision / previous-year papers, max 3 subjects a day
    var revTasks = [];
    if (revCands.length) {
      revCands.sort(function (a, b) { return a.dte - b.dte; });
      var finals = revCands.filter(function (c) { return c.dte === 1; });
      finals.forEach(function (c) {
        revTasks.push(mk('revise', c.s, null, 'Final revision: ' + c.s.name + ' (exam tomorrow)',
          'All units, formula sheet / short notes & important questions. Sleep on time!'));
      });
      var others = revCands.filter(function (c) { return c.dte > 1; });
      var slots = Math.min(others.length, Math.max(0, 3 - finals.length));
      var off = others.length ? dayNum(day) % others.length : 0;
      for (var j = 0; j < slots; j++) {
        var c = others[(off + j) % others.length];
        var step = R - c.dte;
        var units = unitsOf(ctx.topicsBy[c.s.id]);
        if (step % 3 === 2 || !units.length) {
          revTasks.push(mk('revise', c.s, null, 'Solve a previous-year paper: ' + c.s.name,
            'Timed (3 hrs), exam conditions. Then check answers & note weak topics.'));
        } else {
          var u = units[((step % units.length) + units.length) % units.length];
          revTasks.push(mk('revise', c.s, null, 'Revise ' + c.s.short + ' — ' + u,
            'Re-read notes, formulas & key diagrams; attempt 3 important questions.'));
        }
      }
    }

    // 3) Nothing new left but exams still ahead → practice
    if (!active.length && !revCands.length && upcoming.length) {
      var pick = upcoming[dayNum(day) % upcoming.length].s;
      revTasks.push(mk('revise', pick, null, 'Practice: previous-year questions of ' + pick.name,
        'Syllabus complete for now — strengthen it with PYQs and weak-topic revision.'));
    }

    // 4) Spaced repetition of finished topics
    var spacedTasks = [];
    var bySub = {};
    Object.keys(doneDates).forEach(function (tid) {
      var t = ctx.topicById[tid];
      if (!t) return;
      var gap = diffDays(doneDates[tid], day);
      if (SPACED_GAPS.indexOf(gap) < 0) return;
      var s = ctx.subById[t.subjectId];
      var exam = examFor(s, st);
      if (!exam || diffDays(day, exam) < 1) return;
      (bySub[s.id] = bySub[s.id] || []).push(t.title);
    });
    Object.keys(bySub).sort(function (a, b) { return bySub[b].length - bySub[a].length; }).slice(0, 2).forEach(function (sid) {
      var list = bySub[sid];
      var s = ctx.subById[sid];
      var shown = list.slice(0, 3).join(' • ') + (list.length > 3 ? ' • +' + (list.length - 3) + ' more' : '');
      spacedTasks.push(mk('spaced', s, null, 'Quick recall (10 min): ' + s.short, shown));
    });

    if (!tasks.length && !studyTasks.length && !revTasks.length && !spacedTasks.length) info.mode = upcoming.length ? 'free' : 'over';
    return { tasks: tasks.concat(studyTasks, revTasks, spacedTasks), info: info };
  }

  function mk(kind, s, topic, title, hint) {
    return {
      id: uid(),
      key: kind + ':' + (topic ? topic.id : s.id + ':' + title),
      kind: kind,
      subjectId: s.id,
      topicId: topic ? topic.id : '',
      title: title,
      hint: hint || '',
      unit: '',
      carried: false,
      done: false
    };
  }

  // subjectId -> last day (before beforeKey) that had a study task for it
  function lastStudied(beforeKey) {
    var m = {};
    Object.keys(state.days).sort().forEach(function (k) {
      if (k >= beforeKey) return;
      state.days[k].tasks.forEach(function (t) { if (t.kind === 'study' && t.subjectId) m[t.subjectId] = k; });
    });
    return m;
  }

  function previouslyPlannedTopics(beforeKey) {
    var set = {};
    Object.keys(state.days).forEach(function (k) {
      if (k >= beforeKey) return;
      state.days[k].tasks.forEach(function (t) { if (t.topicId) set[t.topicId] = true; });
    });
    return set;
  }

  // Creates today's plan once per day (then it stays fixed so it doesn't shuffle on reload).
  function ensureToday() {
    var k = todayKey();
    if (state.days[k]) return state.days[k];
    if (!hasAnyExam(state)) return null;
    var res = buildPlan(k, state, buildCtx(state), state.topicDone, lastStudied(k));
    var prev = previouslyPlannedTopics(k);
    res.tasks.forEach(function (t) { if (t.topicId && prev[t.topicId]) t.carried = true; });
    state.days[k] = { tasks: res.tasks, info: res.info };
    save();
    return state.days[k];
  }

  // Re-plans today but keeps finished tasks and your own custom tasks.
  function replanToday() {
    var k = todayKey();
    var day = state.days[k];
    if (!hasAnyExam(state)) return;
    if (!day) { ensureToday(); return; }
    var kept = day.tasks.filter(function (t) { return t.done || t.kind === 'custom'; });
    var keys = {};
    kept.forEach(function (t) { if (t.key) keys[t.key] = true; });
    var res = buildPlan(k, state, buildCtx(state), state.topicDone, lastStudied(k));
    var prev = previouslyPlannedTopics(k);
    var fresh = res.tasks.filter(function (t) { return !keys[t.key]; });
    fresh.forEach(function (t) { if (t.topicId && prev[t.topicId]) t.carried = true; });
    var customs = kept.filter(function (t) { return t.kind === 'custom'; });
    var doneGen = kept.filter(function (t) { return t.kind !== 'custom'; });
    day.tasks = doneGen.concat(fresh, customs);
    day.info = res.info;
    save();
  }

  /* ---------------- Streaks ---------------- */
  function dayStat(k) {
    var d = state.days[k];
    if (!d || !d.tasks.length) return null;
    var done = d.tasks.filter(function (t) { return t.done; }).length;
    var pct = done / d.tasks.length * 100;
    return { total: d.tasks.length, done: done, pct: pct, ok: pct + 1e-9 >= state.settings.threshold };
  }
  function streakInfo() {
    var tk = todayKey();
    var cur = 0;
    var t = dayStat(tk);
    var k = t && t.ok ? tk : addDays(tk, -1);
    while (cur < 100000) {
      var s = dayStat(k);
      if (s && s.ok) { cur++; k = addDays(k, -1); } else break;
    }
    var keys = Object.keys(state.days).sort();
    var best = 0, run = 0, last = null;
    keys.forEach(function (key) {
      var s = dayStat(key);
      if (s && s.ok) {
        run = last && diffDays(last, key) === 1 ? run + 1 : 1;
        last = key;
        if (run > best) best = run;
      } else { run = 0; last = null; }
    });
    if (cur > best) best = cur;
    var next = MILESTONES[MILESTONES.length - 1];
    var prevM = 0;
    for (var i = 0; i < MILESTONES.length; i++) {
      if (MILESTONES[i] > cur) { next = MILESTONES[i]; prevM = i ? MILESTONES[i - 1] : 0; break; }
      if (i === MILESTONES.length - 1) { prevM = cur; next = cur + 30; }
    }
    return { current: cur, best: best, todayOk: !!(t && t.ok), next: next, prev: prevM };
  }

  /* ---------------- UI: helpers ---------------- */
  var toastTimer = null;
  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2600);
  }
  function confetti() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var box = $('#confetti');
    box.innerHTML = '';
    var colors = ['#6366f1', '#f59e0b', '#10b981', '#ec4899', '#0ea5e9', '#ef4444'];
    for (var i = 0; i < 90; i++) {
      var p = document.createElement('i');
      p.style.left = Math.random() * 100 + 'vw';
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = Math.random() * 0.6 + 's';
      p.style.animationDuration = 1.8 + Math.random() * 1.4 + 's';
      p.style.transform = 'rotate(' + Math.random() * 360 + 'deg)';
      box.appendChild(p);
    }
    setTimeout(function () { box.innerHTML = ''; }, 3800);
  }
  function ring(pct, size, stroke, color, inner) {
    var r = (size - stroke) / 2, c = 2 * Math.PI * r;
    var off = c * (1 - Math.max(0, Math.min(1, pct)));
    return '<div class="ring" style="width:' + size + 'px;height:' + size + 'px">' +
      '<svg viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '">' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" stroke-width="' + stroke + '" class="ring-bg"/>' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" stroke-width="' + stroke + '" stroke="' + color + '"' +
      ' stroke-dasharray="' + c.toFixed(2) + '" stroke-dashoffset="' + off.toFixed(2) + '" class="ring-fg" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"/>' +
      '</svg><div class="ring-inner">' + inner + '</div></div>';
  }
  function subColor(id) { var s = subjectById(id); return s ? s.color : '#64748b'; }
  function subjectById(id) {
    for (var i = 0; i < state.subjects.length; i++) if (state.subjects[i].id === id) return state.subjects[i];
    return null;
  }
  function quoteFor(k) {
    var q = window.ES_QUOTES;
    return q[((dayNum(k) % q.length) + q.length) % q.length];
  }
  function greeting() {
    var h = new Date().getHours();
    return h < 5 ? 'Burning the midnight oil' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }
  function nearestExam() {
    var tk = todayKey(), best = null;
    state.subjects.forEach(function (s) {
      var e = examFor(s, state);
      if (!e) return;
      var d = diffDays(tk, e);
      if (d >= 0 && (best === null || d < best)) best = d;
    });
    return best;
  }

  /* ---------------- Theme ---------------- */
  function applyTheme() {
    var t = state.settings.theme;
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }
  function isDark() {
    var t = state.settings.theme;
    if (t !== 'auto') return t === 'dark';
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  /* ---------------- Rendering ---------------- */
  var currentTab = 'today';
  var currentDayKey = todayKey();

  function renderAll() {
    applyTheme();
    $('#storageWarn').hidden = storageOk;
    var ne = nearestExam();
    var chip = $('#countdownChip');
    if (ne === null) { chip.textContent = 'Set exam date'; chip.className = 'chip'; }
    else if (ne === 0) { chip.textContent = '📝 Exam today'; chip.className = 'chip hot'; }
    else { chip.textContent = '⏳ ' + ne + (ne === 1 ? ' day' : ' days') + ' to exam'; chip.className = 'chip' + (ne <= 7 ? ' hot' : ''); }
    renderTab(currentTab);
  }
  function renderTab(name) {
    if (name === 'today') renderToday();
    else if (name === 'plan') renderPlan();
    else if (name === 'syllabus') renderSyllabus();
    else if (name === 'progress') renderProgress();
    else if (name === 'settings') renderSettings();
  }
  function switchTab(name) {
    if (name === currentTab) return;
    if (currentTab === 'syllabus' && syllabusDirty() && !confirm('You have unsaved syllabus changes. Leave without saving?')) return;
    currentTab = name;
    $all('#tabs button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-tab') === name); });
    $all('.tab-panel').forEach(function (p) { p.hidden = p.id !== 'tab-' + name; });
    renderTab(name);
    window.scrollTo(0, 0);
  }

  function examSetupCard() {
    return '<div class="card setup"><h2>👋 Welcome! Let\'s set up your plan</h2>' +
      '<p>When does your <b>End-Sem exam</b> start? Your daily goals for Physics, Maths, Programming, IKS, OB, UHV & ENV are planned backwards from this date.</p>' +
      '<div class="row"><input type="date" id="setupExam" min="' + todayKey() + '" aria-label="Exam start date">' +
      '<button type="button" class="btn primary" id="setupSave">Create my plan 🚀</button></div>' +
      '<p class="muted small">Tip: different exam dates per subject and your own syllabus can be set in the Syllabus tab.</p></div>';
  }

  function renderToday() {
    var el = $('#tab-today');
    var k = todayKey();
    var day = ensureToday();
    var q = quoteFor(k);
    var html = '<div class="hello"><div><h2>' + greeting() + '! 👋</h2><p class="muted">' +
      esc(fmtDate(k, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })) + '</p></div></div>';
    html += '<div class="card quote"><div class="q-mark">“</div><p class="q-text">' + esc(q.q) +
      '</p><p class="q-author">— ' + esc(q.a) + '</p><span class="q-tag">Thought of the day</span></div>';

    if (!day) { el.innerHTML = html + examSetupCard(); bindSetup(); return; }

    var st = dayStat(k) || { total: 0, done: 0, pct: 0, ok: false };
    var sk = streakInfo();
    var need = Math.max(0, Math.ceil(state.settings.threshold / 100 * st.total - 1e-9) - st.done);
    var span = Math.max(1, sk.next - sk.prev);
    var flame = sk.current === 0 ? '🌱' : sk.current < 7 ? '🔥' : sk.current < 30 ? '🚀' : '🏆';

    html += '<div class="grid2">' +
      '<div class="card meter"><h3>Streak meter</h3><div class="meter-row">' +
      ring((sk.current - sk.prev) / span, 120, 12, '#f97316',
        '<div class="big">' + flame + '</div><div class="num">' + sk.current + '</div><div class="lbl">day' + (sk.current === 1 ? '' : 's') + '</div>') +
      '<div class="meter-txt"><p><b>Best:</b> ' + sk.best + ' day' + (sk.best === 1 ? '' : 's') + '</p>' +
      '<p><b>Next badge:</b> ' + sk.next + ' days</p>' +
      (sk.todayOk ? '<p class="ok">✅ Today\'s streak is secured!</p>' :
        st.total ? '<p class="warn-t">Finish ' + need + ' more task' + (need === 1 ? '' : 's') + ' to ' + (sk.current ? 'keep' : 'start') + ' your streak</p>' : '<p class="muted">Add a task to start your streak</p>') +
      '</div></div>' + last7Html() + '</div>' +
      '<div class="card meter"><h3>Today\'s progress</h3><div class="meter-row">' +
      ring(st.total ? st.done / st.total : 0, 120, 12, '#10b981',
        '<div class="num">' + Math.round(st.pct) + '%</div><div class="lbl">' + st.done + '/' + st.total + ' done</div>') +
      '<div class="meter-txt">' + todayBreakdown(day) + '</div></div></div></div>';

    if (day.info && day.info.behind) {
      html += '<div class="banner warn">⚡ You need about <b>' + esc(day.info.needPerDay) + ' topics/day</b> to finish before revision, but your daily limit is ' +
        state.settings.maxPerDay + '. Increase "Max new topics per day" in Settings or do extra topics when you can.</div>';
    }

    html += '<div class="card"><div class="list-head"><h3>📝 Today\'s to-do list</h3>' +
      '<button type="button" class="btn ghost small" id="replanBtn" title="Re-plan today (keeps finished and your own tasks)">↻ Re-plan</button></div>';
    if (!day.tasks.length) {
      html += '<p class="empty">' + (day.info && day.info.mode === 'over' ? '🎉 All exams are over. Well done! Add your own tasks below.' : 'Nothing planned. Add your own tasks below.') + '</p>';
    } else {
      html += '<ul class="tasks" id="taskList">' + day.tasks.map(taskHtml).join('') + '</ul>';
    }
    html += '<form class="add-row" id="addForm" autocomplete="off">' +
      '<input type="text" id="addText" maxlength="200" placeholder="Add your own task… (e.g. Lab file, assignment)" aria-label="New task">' +
      '<select id="addSub" aria-label="Subject"><option value="">General</option>' +
      state.subjects.map(function (s) { return '<option value="' + s.id + '">' + esc(s.short) + '</option>'; }).join('') +
      '</select><button type="submit" class="btn primary">Add</button></form></div>';

    el.innerHTML = html;

    var list = $('#taskList');
    if (list) list.addEventListener('click', onTaskClick);
    $('#replanBtn').addEventListener('click', function () {
      if (!confirm('Re-plan today? Finished tasks and your own tasks are kept.')) return;
      replanToday(); renderAll(); toast('Today\'s plan refreshed');
    });
    $('#addForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var txt = $('#addText').value.trim();
      if (!txt) { $('#addText').focus(); return; }
      var d = state.days[todayKey()] || ensureTodayEmpty();
      d.tasks.push({ id: uid(), key: 'custom:' + uid(), kind: 'custom', subjectId: $('#addSub').value, topicId: '', title: txt, hint: '', unit: '', carried: false, done: false });
      save(); renderAll();
      var inp = $('#addText'); if (inp) inp.focus();
    });
  }
  function ensureTodayEmpty() {
    var k = todayKey();
    if (!state.days[k]) state.days[k] = { tasks: [], info: {} };
    return state.days[k];
  }
  function last7Html() {
    var tk = todayKey(), out = '<div class="week">';
    for (var i = 6; i >= 0; i--) {
      var k = addDays(tk, -i), s = dayStat(k);
      var cls = s && s.ok ? 'on' : s && s.done ? 'part' : '';
      if (i === 0 && !(s && s.ok)) cls += ' today';
      out += '<div class="wd ' + cls + '" title="' + esc(fmtDate(k)) + (s ? ': ' + s.done + '/' + s.total : '') + '"><span>' +
        esc(parseKey(k).toLocaleDateString(undefined, { weekday: 'narrow' })) + '</span><i>' + (s && s.ok ? '🔥' : '') + '</i></div>';
    }
    return out + '</div>';
  }
  function todayBreakdown(day) {
    var c = { study: 0, revise: 0, spaced: 0, exam: 0, custom: 0 };
    day.tasks.forEach(function (t) { if (c[t.kind] !== undefined) c[t.kind]++; });
    var rows = [];
    if (c.exam) rows.push('📝 ' + c.exam + ' exam' + (c.exam > 1 ? 's' : '') + ' today');
    if (c.study) rows.push('📖 ' + c.study + ' new topic' + (c.study > 1 ? 's' : ''));
    if (c.revise) rows.push('🔁 ' + c.revise + ' revision task' + (c.revise > 1 ? 's' : ''));
    if (c.spaced) rows.push('🧠 ' + c.spaced + ' quick recall');
    if (c.custom) rows.push('✏️ ' + c.custom + ' own task' + (c.custom > 1 ? 's' : ''));
    return rows.length ? '<p>' + rows.join('</p><p>') + '</p>' : '<p class="muted">No tasks yet</p>';
  }
  function taskHtml(t) {
    var s = subjectById(t.subjectId);
    var tag = s ? '<span class="tag" style="--c:' + s.color + '">' + esc(s.short) + '</span>' : '<span class="tag" style="--c:#64748b">General</span>';
    var kindIcon = { study: '📖', revise: '🔁', spaced: '🧠', exam: '📝', custom: '✏️' }[t.kind] || '•';
    return '<li class="task' + (t.done ? ' done' : '') + '" data-id="' + esc(t.id) + '" style="--c:' + (s ? s.color : '#64748b') + '">' +
      '<button type="button" class="check" data-act="toggle" role="checkbox" aria-checked="' + t.done + '" aria-label="Mark ' + esc(t.title) + ' as done"></button>' +
      '<div class="t-body" data-act="toggle"><div class="t-top">' + tag + (t.carried ? '<span class="badge">↻ carried over</span>' : '') +
      (t.unit ? '<span class="unit">' + esc(t.unit) + '</span>' : '') + '</div>' +
      '<div class="t-title">' + kindIcon + ' ' + esc(t.title) + '</div>' + (t.hint ? '<div class="t-hint">' + esc(t.hint) + '</div>' : '') + '</div>' +
      (t.kind === 'custom' ? '<button type="button" class="icon-btn del" data-act="del" aria-label="Delete task" title="Delete">✕</button>' : '') +
      '</li>';
  }
  function onTaskClick(e) {
    var actEl = e.target.closest('[data-act]');
    var li = e.target.closest('li.task');
    if (!actEl || !li) return;
    var k = todayKey();
    var day = state.days[k];
    if (!day) return;
    var id = li.getAttribute('data-id');
    var idx = -1;
    for (var i = 0; i < day.tasks.length; i++) if (day.tasks[i].id === id) { idx = i; break; }
    if (idx < 0) { renderAll(); return; }
    var t = day.tasks[idx];
    if (actEl.getAttribute('data-act') === 'del') {
      day.tasks.splice(idx, 1);
      save(); renderAll(); toast('Task deleted');
      return;
    }
    var before = streakInfo().todayOk;
    t.done = !t.done;
    if (t.topicId) {
      if (t.done) state.topicDone[t.topicId] = k;
      else delete state.topicDone[t.topicId];
    }
    save();
    renderAll();
    var st = dayStat(k);
    if (t.done && st && st.done === st.total) { confetti(); toast('🎉 All tasks done! Amazing work today!'); }
    else if (t.done && !before && streakInfo().todayOk) { toast('🔥 Streak secured for today!'); }
  }
  function bindSetup() {
    var btn = $('#setupSave');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var v = $('#setupExam').value;
      if (!isKey(v)) { toast('Please pick a valid date'); return; }
      if (diffDays(todayKey(), v) < 1) { toast('Pick a date after today'); return; }
      state.settings.examDate = v;
      save(); renderAll(); toast('Plan created! Let\'s go 🚀');
    });
  }

  /* ----- Plan tab: 7-day forecast + finishing strategy ----- */
  function renderPlan() {
    var el = $('#tab-plan');
    if (!hasAnyExam(state)) { el.innerHTML = examSetupCard(); bindSetup(); return; }
    var ctx = buildCtx(state);
    var tk = todayKey();
    var sim = clone(state.topicDone);
    var today = state.days[tk];
    var seen = lastStudied(tk);
    if (today) today.tasks.forEach(function (t) {
      if (t.topicId && !sim[t.topicId]) sim[t.topicId] = tk;
      if (t.kind === 'study') seen[t.subjectId] = tk;
    });

    var html = '<div class="card"><h3>🧭 Strategy per subject</h3><p class="muted small">Topics left ÷ study days left before the ' +
      state.settings.revisionDays + '-day revision window = topics needed per day.</p><div class="table-wrap"><table class="strat"><thead><tr><th>Subject</th><th>Exam</th><th>Left</th><th>Study days</th><th>Per day</th></tr></thead><tbody>';
    state.subjects.forEach(function (s) {
      var exam = examFor(s, state);
      var ts = ctx.topicsBy[s.id];
      var left = ts.filter(function (t) { return !state.topicDone[t.id]; }).length;
      var dte = exam ? diffDays(tk, exam) : null;
      var sd = dte === null ? '—' : Math.max(0, dte - state.settings.revisionDays);
      var per = dte === null || dte < 0 ? '—' : !left ? '✅' : (left / Math.max(1, sd || dte)).toFixed(1);
      html += '<tr><td title="' + esc(s.name) + '"><span class="dot" style="background:' + s.color + '"></span>' + esc(s.short) + '</td><td>' +
        (exam ? esc(fmtDate(exam, { day: 'numeric', month: 'short' })) + (dte < 0 ? ' (done)' : '') : '—') + '</td><td>' + left + '/' + ts.length +
        '</td><td>' + sd + '</td><td><b>' + per + '</b></td></tr>';
    });
    html += '</tbody></table></div></div>';

    html += '<h3 class="section-h">Next 7 days (if you finish each day\'s plan)</h3><div class="forecast">';
    for (var i = 1; i <= 7; i++) {
      var k = addDays(tk, i);
      var res = buildPlan(k, state, ctx, sim, seen);
      res.tasks.forEach(function (t) { if (t.topicId) sim[t.topicId] = k; if (t.kind === 'study') seen[t.subjectId] = k; });
      html += '<div class="card fday"><div class="fday-h"><b>' + esc(fmtDate(k)) + '</b><span class="muted small">' + res.tasks.length + ' tasks</span></div>';
      html += res.tasks.length ? '<ul>' + res.tasks.map(function (t) {
        return '<li><span class="dot" style="background:' + subColor(t.subjectId) + '"></span>' + esc(t.title) + '</li>';
      }).join('') + '</ul>' : '<p class="muted small">Free day / exams over</p>';
      html += '</div>';
    }
    el.innerHTML = html + '</div>';
  }

  /* ----- Syllabus tab ----- */
  var selSub = 'phy';
  function syllabusDirty() {
    var ta = $('#sylText');
    if (!ta || currentTab !== 'syllabus') return false;
    var s = subjectById(selSub);
    return !!s && (ta.value !== s.syllabus || $('#sylName').value.trim() !== s.name || $('#sylShort').value.trim() !== s.short ||
      $('#sylExam').value !== s.examDate || $('#sylPrio').value !== String(s.priority) || $('#sylKind').value !== s.kind);
  }
  function renderSyllabus() {
    var el = $('#tab-syllabus');
    var s = subjectById(selSub) || state.subjects[0];
    selSub = s.id;
    var ctx = buildCtx(state);
    var html = '<div class="sub-chips" id="subChips">' + state.subjects.map(function (x) {
      var ts = ctx.topicsBy[x.id], d = ts.filter(function (t) { return state.topicDone[t.id]; }).length;
      return '<button type="button" class="sub-chip' + (x.id === s.id ? ' active' : '') + '" data-sub="' + x.id + '" style="--c:' + x.color + '">' +
        esc(x.short) + ' <small>' + d + '/' + ts.length + '</small></button>';
    }).join('') + '</div>';

    html += '<div class="card"><h3>Edit: ' + esc(s.name) + '</h3><div class="form-grid">' +
      '<label>Subject name<input type="text" id="sylName" maxlength="60" value="' + esc(s.name) + '"></label>' +
      '<label>Short name<input type="text" id="sylShort" maxlength="8" value="' + esc(s.short) + '"></label>' +
      '<label>Exam date <small class="muted">(blank = common date)</small><input type="date" id="sylExam" value="' + esc(s.examDate) + '"></label>' +
      '<label>Priority<select id="sylPrio"><option value="3">High</option><option value="2">Normal</option><option value="1">Low</option></select></label>' +
      '<label>Study style<select id="sylKind"><option value="numerical">Numericals (Physics/Maths)</option><option value="coding">Coding / programs</option><option value="theory">Theory / notes</option></select></label>' +
      '</div>' +
      '<label class="block">Syllabus <small class="muted">— one topic per line. Start a unit with <code># Unit 1: Title</code></small>' +
      '<textarea id="sylText" rows="14" spellcheck="false">' + esc(s.syllabus) + '</textarea></label>' +
      '<div class="row wrap"><button type="button" class="btn primary" id="sylSave">💾 Save syllabus</button>' +
      '<button type="button" class="btn ghost" id="sylSmart" title="Split pasted paragraphs into one topic per line">✨ Smart format pasted text</button>' +
      '<span class="muted small" id="sylCount"></span></div></div>';

    var topics = ctx.topicsBy[s.id];
    html += '<div class="card"><h3>Topics checklist</h3><p class="muted small">Tick topics you have already finished — the planner skips them.</p>';
    if (!topics.length) html += '<p class="empty">No topics yet. Paste your syllabus above and save.</p>';
    unitsOf(topics).forEach(function (u) {
      var ts = topics.filter(function (t) { return t.unit === u; });
      html += '<div class="unit-block"><h4>' + esc(u) + '</h4><ul class="topic-list">' + ts.map(function (t) {
        var d = state.topicDone[t.id];
        return '<li><label><input type="checkbox" data-topic="' + esc(t.id) + '"' + (d ? ' checked' : '') + '> <span>' + esc(t.title) + '</span>' +
          (d ? '<small class="muted"> ✓ ' + esc(fmtDate(d, { day: 'numeric', month: 'short' })) + '</small>' : '') + '</label></li>';
      }).join('') + '</ul></div>';
    });
    html += '</div>';
    el.innerHTML = html;

    $('#sylPrio').value = String(s.priority);
    $('#sylKind').value = s.kind;
    var updateCount = function () {
      var n = parseSyllabus({ id: s.id, syllabus: $('#sylText').value }).length;
      $('#sylCount').textContent = n + ' topic' + (n === 1 ? '' : 's') + ' detected';
    };
    updateCount();
    $('#sylText').addEventListener('input', updateCount);

    $('#subChips').addEventListener('click', function (e) {
      var b = e.target.closest('[data-sub]');
      if (!b || b.getAttribute('data-sub') === selSub) return;
      if (syllabusDirty() && !confirm('You have unsaved changes for ' + s.short + '. Discard them?')) return;
      selSub = b.getAttribute('data-sub');
      renderSyllabus();
    });
    $('#sylSmart').addEventListener('click', function () {
      var ta = $('#sylText');
      ta.value = smartFormat(ta.value);
      updateCount();
      toast('Formatted — check it, then press Save');
    });
    $('#sylSave').addEventListener('click', function () {
      var exam = $('#sylExam').value;
      if (exam && !isKey(exam)) { toast('Exam date is not valid'); return; }
      var text = $('#sylText').value;
      if (!parseSyllabus({ id: s.id, syllabus: text }).length && !confirm('No topics found. Save an empty syllabus for ' + s.short + '?')) return;
      s.name = $('#sylName').value.trim() || s.name;
      s.short = ($('#sylShort').value.trim() || s.short).slice(0, 8);
      s.examDate = exam;
      s.priority = clampInt($('#sylPrio').value, 1, 3, 2);
      s.kind = KIND_HINT[$('#sylKind').value] ? $('#sylKind').value : 'theory';
      s.syllabus = text;
      cleanupTopicDone();
      save();
      replanToday();
      renderAll();
      toast('Saved ✓ Today\'s plan updated');
    });
    el.querySelectorAll('input[data-topic]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        if (syllabusDirty()) { cb.checked = !cb.checked; toast('Save your syllabus edits first'); return; }
        var tid = cb.getAttribute('data-topic');
        var k = todayKey();
        if (cb.checked) state.topicDone[tid] = k; else delete state.topicDone[tid];
        var day = state.days[k];
        if (day) day.tasks.forEach(function (t) { if (t.topicId === tid) t.done = cb.checked; });
        save();
        renderAll();
      });
    });
  }
  // Drops "done" marks for topics that no longer exist in any syllabus.
  function cleanupTopicDone() {
    var ctx = buildCtx(state);
    Object.keys(state.topicDone).forEach(function (tid) { if (!ctx.topicById[tid]) delete state.topicDone[tid]; });
  }

  /* ----- Progress tab ----- */
  function renderProgress() {
    var el = $('#tab-progress');
    var ctx = buildCtx(state);
    var total = 0, done = 0;
    var rows = state.subjects.map(function (s) {
      var ts = ctx.topicsBy[s.id];
      var d = ts.filter(function (t) { return state.topicDone[t.id]; }).length;
      total += ts.length; done += d;
      var p = ts.length ? Math.round(d / ts.length * 100) : 0;
      return '<div class="bar-row"><div class="bar-lbl"><span>' + esc(s.name) + '</span><b>' + d + '/' + ts.length + ' · ' + p + '%</b></div>' +
        '<div class="bar"><i style="width:' + p + '%;background:' + s.color + '"></i></div></div>';
    }).join('');
    var sk = streakInfo();
    var keys = Object.keys(state.days);
    var tasksDone = 0, activeDays = 0;
    keys.forEach(function (k) {
      var s = dayStat(k);
      if (s) { tasksDone += s.done; if (s.done) activeDays++; }
    });
    var overall = total ? done / total : 0;

    var html = '<div class="grid2"><div class="card meter"><h3>Syllabus covered</h3><div class="meter-row">' +
      ring(overall, 130, 14, '#6366f1', '<div class="num">' + Math.round(overall * 100) + '%</div><div class="lbl">' + done + '/' + total + ' topics</div>') +
      '<div class="meter-txt"><p>🔥 Current streak: <b>' + sk.current + '</b></p><p>🏆 Best streak: <b>' + sk.best + '</b></p>' +
      '<p>✅ Tasks completed: <b>' + tasksDone + '</b></p><p>📅 Active days: <b>' + activeDays + '</b></p></div></div></div>' +
      '<div class="card"><h3>Subject-wise progress</h3>' + rows + '</div></div>';

    // 12-week heatmap
    var tk = todayKey();
    var start = addDays(tk, -(7 * 11 + ((parseKey(tk).getDay() + 6) % 7))); // Monday, 11 weeks ago
    html += '<div class="card"><h3>Consistency calendar</h3><div class="heat-wrap"><div class="heat">';
    for (var k = start; diffDays(k, tk) >= 0; k = addDays(k, 1)) {
      var s = dayStat(k);
      var lvl = !s ? 0 : s.ok ? (s.pct >= 100 ? 4 : 3) : s.done ? (s.pct >= 30 ? 2 : 1) : 0;
      html += '<i class="l' + lvl + (k === tk ? ' now' : '') + '" title="' + esc(fmtDate(k)) + (s ? ' — ' + s.done + '/' + s.total + ' tasks' : '') + '"></i>';
    }
    html += '</div></div><div class="legend"><span>Less</span><i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i><span>More</span></div>' +
      '<p class="muted small">A day counts for your streak when at least ' + state.settings.threshold + '% of its tasks are done.</p></div>';

    // recent history
    var recent = keys.sort().reverse().filter(function (k) { return k < tk; }).slice(0, 10);
    html += '<div class="card"><h3>Recent days</h3>';
    if (!recent.length) html += '<p class="empty">History will appear here from tomorrow.</p>';
    else html += '<ul class="hist">' + recent.map(function (k) {
      var s = dayStat(k) || { done: 0, total: 0, ok: false };
      return '<li><span>' + esc(fmtDate(k)) + '</span><span>' + s.done + '/' + s.total + ' ' + (s.ok ? '🔥' : '—') + '</span></li>';
    }).join('') + '</ul>';
    el.innerHTML = html + '</div>';
  }

  /* ----- Settings tab ----- */
  function renderSettings() {
    var el = $('#tab-settings');
    var S = state.settings;
    el.innerHTML = '<div class="card"><h3>📅 Exam & plan</h3><div class="form-grid">' +
      '<label>End-Sem start date (common for all subjects)<input type="date" id="setExam" value="' + esc(S.examDate) + '"></label>' +
      '<label>Revision days before exam<input type="number" id="setRev" min="0" max="30" value="' + S.revisionDays + '"></label>' +
      '<label>Max new topics per day<input type="number" id="setMax" min="1" max="20" value="' + S.maxPerDay + '"></label>' +
      '<label>Min new topics per day<input type="number" id="setMin" min="0" max="20" value="' + S.minPerDay + '"></label>' +
      '<label>Streak counts when tasks done ≥<select id="setThr">' + [50, 60, 75, 100].map(function (v) {
        return '<option value="' + v + '"' + (S.threshold === v ? ' selected' : '') + '>' + v + '%</option>';
      }).join('') + (([50, 60, 75, 100].indexOf(S.threshold) < 0) ? '<option value="' + S.threshold + '" selected>' + S.threshold + '%</option>' : '') + '</select></label>' +
      '<label>Theme<select id="setTheme"><option value="auto">Auto (device)</option><option value="light">Light</option><option value="dark">Dark</option></select></label>' +
      '</div><div class="row"><button type="button" class="btn primary" id="setSave">💾 Save settings</button></div></div>' +

      '<div class="card"><h3>💾 Backup</h3><p class="muted small">Your data lives only in this browser. Export a backup now and then (or to move to another device).</p>' +
      '<div class="row wrap"><button type="button" class="btn" id="expBtn">⬇️ Export backup</button>' +
      '<label class="btn" for="impFile">⬆️ Import backup</label><input type="file" id="impFile" accept=".json,application/json" hidden></div></div>' +

      '<div class="card danger"><h3>⚠️ Danger zone</h3><div class="row wrap">' +
      '<button type="button" class="btn" id="resetSyl">Restore sample syllabus</button>' +
      '<button type="button" class="btn red" id="resetAll">Reset everything</button></div></div>' +
      '<p class="muted small center">EndSem Focus · PIN protected · Works offline</p>';

    $('#setTheme').value = S.theme;
    $('#setSave').addEventListener('click', function () {
      var exam = $('#setExam').value;
      if (exam && !isKey(exam)) { toast('Exam date is not valid'); return; }
      var max = clampInt($('#setMax').value, 1, 20, 6);
      var min = clampInt($('#setMin').value, 0, 20, 3);
      if (min > max) { toast('Min topics cannot be more than max'); return; }
      S.examDate = exam;
      S.revisionDays = clampInt($('#setRev').value, 0, 30, 7);
      S.maxPerDay = max;
      S.minPerDay = min;
      S.threshold = clampInt($('#setThr').value, 10, 100, 60);
      S.theme = $('#setTheme').value;
      save();
      replanToday();
      renderAll();
      toast('Settings saved ✓');
    });
    $('#expBtn').addEventListener('click', function () {
      var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'endsem-focus-backup-' + todayKey() + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      toast('Backup downloaded');
    });
    $('#impFile').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        try {
          var data = JSON.parse(r.result);
          if (!data || !data.subjects || !data.settings) throw new Error('bad');
          if (!confirm('Replace all current data with this backup?')) return;
          state = normalize(data);
          save(); renderAll(); toast('Backup restored ✓');
        } catch (err) { toast('That file is not a valid backup'); }
      };
      r.onerror = function () { toast('Could not read the file'); };
      r.readAsText(f);
      e.target.value = '';
    });
    $('#resetSyl').addEventListener('click', function () {
      if (!confirm('Replace all subjects\' syllabus with the sample syllabus? Exam dates & progress settings stay.')) return;
      var defs = clone(window.ES_DEFAULT_SUBJECTS);
      state.subjects.forEach(function (s, i) { s.syllabus = defs[i].syllabus; });
      cleanupTopicDone(); save(); replanToday(); renderAll(); toast('Sample syllabus restored');
    });
    $('#resetAll').addEventListener('click', function () {
      if (!confirm('Delete ALL data (tasks, streaks, syllabus, settings)? This cannot be undone.')) return;
      if (!confirm('Are you really sure?')) return;
      state = defaultState();
      save(); currentTab = 'settings'; switchTab('today'); renderAll(); toast('Everything reset');
    });
  }

  /* ---------------- Lock screen ---------------- */
  var pin = '';
  var attempts = 0;
  var lockTimer = null;
  function lockoutLeft() {
    var until = parseInt(lsGet(LOCKOUT_KEY) || '0', 10) || 0;
    return Math.max(0, until - Date.now());
  }
  function drawDots() {
    $all('#pinDots span').forEach(function (d, i) { d.classList.toggle('filled', i < pin.length); });
  }
  function showLockMsg() {
    var left = lockoutLeft();
    var msg = $('#lockMsg');
    if (left > 0) {
      msg.textContent = 'Too many wrong attempts. Try again in ' + Math.ceil(left / 1000) + 's';
      clearTimeout(lockTimer);
      lockTimer = setTimeout(showLockMsg, 500);
    } else if (msg.textContent.indexOf('Too many') === 0) {
      msg.textContent = '';
    }
  }
  function pressKey(k) {
    if (lockoutLeft() > 0) { showLockMsg(); return; }
    if (k === 'back') pin = pin.slice(0, -1);
    else if (k === 'clear') pin = '';
    else if (/^\d$/.test(k) && pin.length < 4) pin += k;
    drawDots();
    if (pin.length === 4) setTimeout(checkPin, 120);
  }
  function checkPin() {
    if (pin.length !== 4) return;
    if (pin === PIN) {
      attempts = 0;
      pin = '';
      drawDots();
      $('#lockMsg').textContent = '';
      ssSet(UNLOCK_KEY, '1');
      unlock();
    } else {
      attempts++;
      pin = '';
      var card = $('#lockCard');
      card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
      if (attempts >= MAX_ATTEMPTS) {
        attempts = 0;
        lsSet(LOCKOUT_KEY, String(Date.now() + LOCKOUT_MS));
        showLockMsg();
      } else {
        $('#lockMsg').textContent = 'Wrong PIN. ' + (MAX_ATTEMPTS - attempts) + ' attempt' + (MAX_ATTEMPTS - attempts === 1 ? '' : 's') + ' left';
      }
      setTimeout(drawDots, 50);
    }
  }
  function unlock() {
    $('#lock').hidden = true;
    $('#app').hidden = false;
    state = load();
    currentDayKey = todayKey();
    renderAll();
  }
  function lock() {
    if (currentTab === 'syllabus' && syllabusDirty() && !confirm('You have unsaved syllabus changes. Lock anyway?')) return;
    ssDel(UNLOCK_KEY);
    $('#app').hidden = true;
    $all('.tab-panel').forEach(function (p) { p.innerHTML = ''; });
    $('#lock').hidden = false;
    pin = ''; drawDots();
    $('#lockMsg').textContent = '';
    showLockMsg();
  }
  function isUnlocked() { return !$('#app').hidden; }

  /* ---------------- Wiring ---------------- */
  function init() {
    applyTheme();
    $('#keypad').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-k]');
      if (b) pressKey(b.getAttribute('data-k'));
    });
    document.addEventListener('keydown', function (e) {
      if (isUnlocked() || e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^\d$/.test(e.key)) { pressKey(e.key); e.preventDefault(); }
      else if (e.key === 'Backspace') { pressKey('back'); e.preventDefault(); }
      else if (e.key === 'Escape') { pressKey('clear'); }
    });
    $('#tabs').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-tab]');
      if (b) switchTab(b.getAttribute('data-tab'));
    });
    $('#lockBtn').addEventListener('click', lock);
    $('#themeBtn').addEventListener('click', function () {
      state.settings.theme = isDark() ? 'light' : 'dark';
      save(); applyTheme();
      if (currentTab === 'settings') renderSettings();
    });
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var onMq = function () { if (state.settings.theme === 'auto') applyTheme(); };
      if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq);
    }
    // Another tab changed the data → reload it (avoids one tab overwriting the other).
    window.addEventListener('storage', function (e) {
      if (e.key !== STORE_KEY) return;
      state = load();
      if (isUnlocked() && !(currentTab === 'syllabus' && syllabusDirty())) renderAll();
    });
    // New day while the app is open → build the new day's plan.
    var checkDay = function () {
      var k = todayKey();
      if (k !== currentDayKey) {
        currentDayKey = k;
        if (isUnlocked() && !(currentTab === 'syllabus' && syllabusDirty())) renderAll();
      }
    };
    setInterval(checkDay, 30000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) checkDay(); });
    window.addEventListener('beforeunload', function (e) {
      if (isUnlocked() && currentTab === 'syllabus' && syllabusDirty()) { e.preventDefault(); e.returnValue = ''; }
    });

    lsGet(STORE_KEY); // detect blocked storage early
    if (ssGet(UNLOCK_KEY) === '1') unlock();
    else showLockMsg();
  }

  // exposed only for automated tests
  window.__endsem = { buildPlan: buildPlan, buildCtx: buildCtx, parseSyllabus: parseSyllabus, smartFormat: smartFormat, addDays: addDays, diffDays: diffDays, getState: function () { return state; } };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
