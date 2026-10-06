/* 산업안전기사 필기 학습 앱
 * - js/data.js 의 window.SAFETY_DB 를 읽어 과목 → 장 → (핵심 요약 / 4지선다 / OX) 구조로 보여준다.
 * - 학습 상태(푼 문제, 정답, 오답노트, 완료한 장)는 localStorage 에 저장한다.
 */
(() => {
  'use strict';

  const STORE_KEY = 'sanangi.v1';
  const APP_TITLE = '산업안전기사 필기';
  const $app = document.getElementById('app');
  const $title = document.getElementById('pageTitle');
  const $back = document.getElementById('backBtn');
  const $right = document.getElementById('topbarRight');
  const $badge = document.getElementById('wrongBadge');

  /* ---------------- 저장소 ---------------- */
  const blank = () => ({ done: {}, ans: {}, note: {}, subject: null });
  let S = load();
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? Object.assign(blank(), JSON.parse(raw)) : blank();
    } catch (e) { return blank(); }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { /* 저장 불가 환경 */ }
    updateBadge();
  }

  /* ---------------- 데이터 ---------------- */
  const DB = { subjects: [], ch: {}, q: {} };

  function buildDB() {
    const src = window.SAFETY_DB;
    if (!src || !src.subjects) throw new Error('js/data.js 를 불러오지 못했어요.');
    DB.subjects = src.subjects;
    for (const subj of DB.subjects) {
      for (const ch of subj.chapters) {
        ch.subject = subj.id;
        ch.subjectName = subj.name;
        DB.ch[ch.id] = ch;
        ch.items = [];
        for (const q of ch.quizzes || []) {
          q.kind = 'mc'; q.chapter = ch;
          DB.q[q.id] = q; ch.items.push(q);
        }
        for (const o of ch.ox || []) {
          o.kind = 'ox'; o.chapter = ch;
          o.question = o.statement;
          o.options = ['맞다', '틀리다'];
          o.answer = typeof o.answer === 'number' ? o.answer : (o.answer === 'O' ? 1 : 2);
          o.explanation = o.desc;
          DB.q[o.id] = o; ch.items.push(o);
        }
      }
    }
    if (!S.subject || !DB.subjects.find(s => s.id === S.subject && s.chapters.length)) {
      S.subject = (DB.subjects.find(s => s.chapters.length) || DB.subjects[0]).id;
    }
  }
  const subjOf = id => DB.subjects.find(s => s.id === id);
  const subjName = id => (subjOf(id) || {}).name || '';
  const liveSubjects = () => DB.subjects.filter(s => s.chapters.length);

  /* ---------------- 유틸 ---------------- */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // **굵게**, ==형광펜== 지원
  const fmt = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/==(.+?)==/g, '<mark>$1</mark>');
  // 요약 본문: 기존 데이터는 HTML(<b>, <br>)을 그대로 쓰고, 새 데이터는 줄바꿈과 **굵게**를 살린다
  const noteBody = n => n.html ? n.body.replace(/\n/g, '') : fmt(n.body).replace(/\n/g, '<br>');
  const CIRCLE = ['①', '②', '③', '④', '⑤'];
  const chev = '<svg class="chev" width="18" height="18" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const kindTag = q => q.kind === 'ox' ? '<span class="tag pred">OX</span>' : '<span class="tag past">4지선다</span>';
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;

  let toastTimer;
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 1800);
  }

  function updateBadge() {
    const n = Object.keys(S.note).filter(id => DB.q[id]).length;
    $badge.hidden = !n;
    $badge.textContent = n > 99 ? '99+' : n;
  }

  function setChrome({ title = APP_TITLE, back = false, tab = '', right = '' }) {
    $title.textContent = title;
    document.title = title === APP_TITLE ? title : title + ' · 산안기';
    $back.hidden = !back;
    $right.innerHTML = right;
    document.querySelectorAll('.tabbar a').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
  }
  $back.addEventListener('click', () => {
    if (history.length > 1) history.back(); else location.hash = '#/';
  });

  /* ---------------- 통계 ---------------- */
  function chStats(ch) {
    const qs = ch.items || [];
    let solved = 0, ok = 0;
    for (const q of qs) { const a = S.ans[q.id]; if (a) { solved++; if (a.ok) ok++; } }
    return { total: qs.length, mc: (ch.quizzes || []).length, ox: (ch.ox || []).length, notes: (ch.notes || []).length, solved, ok };
  }
  function subjStats(subj) {
    let chs = 0, done = 0, total = 0, solved = 0, ok = 0;
    for (const ch of subj.chapters) {
      chs++; if (S.done[ch.id]) done++;
      const s = chStats(ch); total += s.total; solved += s.solved; ok += s.ok;
    }
    return { chs, done, total, solved, ok };
  }

  function recordAnswer(q, choice) {
    const ok = choice === q.answer;
    const a = S.ans[q.id] || { n: 0, w: 0 };
    a.n++; if (!ok) a.w++;
    a.c = choice; a.ok = ok; a.t = Date.now();
    S.ans[q.id] = a;
    if (!ok) S.note[q.id] = S.note[q.id] || Date.now();
    save();
    return ok;
  }

  /* ---------------- 라우터 ---------------- */
  function parseHash() {
    const h = location.hash.replace(/^#/, '') || '/';
    const [path, qs] = h.split('?');
    return { parts: path.split('/').filter(Boolean), query: new URLSearchParams(qs || '') };
  }

  let cleanup = null;
  function route() {
    if (cleanup) { cleanup(); cleanup = null; }
    const { parts, query } = parseHash();
    try {
      const [p0, p1] = parts;
      if (!p0) viewHome();
      else if (p0 === 'ch' && p1) viewChapter(p1, query);
      else if (p0 === 'ox') viewShuffle('ox', query);
      else if (p0 === 'random') viewShuffle('random', query);
      else if (p0 === 'wrong') viewWrong(query);
      else if (p0 === 'play' && p1) viewPlay(p1);
      else location.hash = '#/';
    } catch (e) {
      console.error(e);
      $app.innerHTML = `<div class="empty"><div class="big">⚠️</div>화면을 그리지 못했어요.<br><span class="small">${esc(e.message)}</span></div>`;
    }
  }
  window.addEventListener('hashchange', () => { route(); window.scrollTo(0, 0); });

  /* ---------------- 목차(홈) ---------------- */
  function viewHome() {
    setChrome({ tab: 'home' });
    const subj = subjOf(S.subject);
    const st = subjStats(subj);

    const subjTabs = DB.subjects.map(s =>
      `<button class="chip ${s.id === S.subject ? 'on' : ''}" data-subj="${s.id}" ${s.chapters.length ? '' : 'disabled'}>${esc(s.short)}${s.chapters.length ? '' : ' · 준비 중'}</button>`).join('');

    const chHtml = subj.chapters.map(ch => {
      const s = chStats(ch);
      return `<a class="sec-item card" href="#/ch/${ch.id}" style="margin-bottom:8px">
        <span class="sec-no">${ch.number}장</span>
        <div class="grow">
          <div class="sec-title">${esc(ch.title)}</div>
          <div class="sec-meta">
            <span>요약 ${s.notes}</span><span>4지선다 ${s.mc}</span><span>OX ${s.ox}</span>
            ${s.solved ? `<span>${s.solved}/${s.total} · 정답률 ${pct(s.ok, s.solved)}%</span>` : ''}
          </div>
        </div>
        <span class="check ${S.done[ch.id] ? 'on' : ''}"></span>
      </a>`;
    }).join('');

    $app.innerHTML = `
      <div class="subject-tabs">${subjTabs}</div>
      <h1 class="h1">${esc(subj.name)}</h1>
      <p class="sub">장을 골라 핵심 요약을 읽고 4지선다·OX 문제를 풀어보세요.</p>
      <div class="overview">
        <div class="stat"><div class="l">학습 완료</div><div class="v">${st.done}<span class="muted small">/${st.chs}</span></div><div class="bar"><i style="width:${pct(st.done, st.chs)}%"></i></div></div>
        <div class="stat"><div class="l">푼 문제</div><div class="v">${st.solved}<span class="muted small">/${st.total}</span></div><div class="bar"><i style="width:${pct(st.solved, st.total)}%"></i></div></div>
        <div class="stat"><div class="l">정답률</div><div class="v">${st.solved ? pct(st.ok, st.solved) + '%' : '–'}</div><div class="bar"><i style="width:${pct(st.ok, st.solved)}%;background:var(--ok)"></i></div></div>
      </div>
      ${continueCard(subj)}
      ${chHtml || '<div class="empty">아직 등록된 장이 없어요.</div>'}
      <p class="small muted" style="text-align:center;margin-top:22px">키보드: 1~4 선택 · O/X 키 · ←/→ 이동<br>학습 기록은 이 기기의 브라우저에만 저장돼요.</p>`;

    $app.querySelectorAll('[data-subj]').forEach(b => b.addEventListener('click', () => {
      S.subject = b.dataset.subj; save(); route();
    }));
  }

  function continueCard(subj) {
    const next = subj.chapters.find(c => !S.done[c.id]);
    if (!next) return '';
    return `<a class="card row" href="#/ch/${next.id}" style="margin-top:12px">
      <div class="grow"><div class="small muted" style="font-weight:700">이어서 학습하기</div>
      <div style="font-weight:700">${next.number}장. ${esc(next.title)}</div></div>${chev}</a>`;
  }

  /* ---------------- 장 상세 ---------------- */
  const chSession = {}; // 장별 풀이 세션 (화면 이동 사이 유지)

  function viewChapter(id, query) {
    const ch = DB.ch[id];
    if (!ch) { location.hash = '#/'; return; }
    if (ch.subject !== S.subject) { S.subject = ch.subject; save(); }
    const want = query.get('tab');
    const tab = (want === 'mc' || want === 'ox') ? want : 'sum';
    setChrome({ title: `${ch.number}장 ${ch.title}`, back: true, tab: 'home' });

    const list = subjOf(ch.subject).chapters;
    const i = list.indexOf(ch);
    const prev = list[i - 1], next = list[i + 1];
    const s = chStats(ch);

    $app.innerHTML = `
      <div class="sec-head">
        <div class="no">${esc(subjName(ch.subject))} · ${ch.number}장</div>
        <h1 class="h1">${esc(ch.title)}</h1>
      </div>
      <div class="seg" role="tablist">
        <button data-tab="sum" class="${tab === 'sum' ? 'on' : ''}" role="tab">핵심 요약 <span class="muted">${s.notes}</span></button>
        <button data-tab="mc" class="${tab === 'mc' ? 'on' : ''}" role="tab">4지선다 <span class="muted">${s.mc}</span></button>
        <button data-tab="ox" class="${tab === 'ox' ? 'on' : ''}" role="tab">OX <span class="muted">${s.ox}</span></button>
      </div>
      <div id="chBody"></div>`;

    $app.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => {
      history.replaceState(null, '', `#/ch/${id}?tab=${b.dataset.tab}`);
      $app.querySelectorAll('.seg button').forEach(x => x.classList.toggle('on', x === b));
      render(b.dataset.tab);
      const seg = $app.querySelector('.seg');
      if (seg.getBoundingClientRect().top < 60) window.scrollTo(0, 0);
    }));

    const body = $app.querySelector('#chBody');
    function render(t) {
      if (cleanup) { cleanup(); cleanup = null; }
      if (t === 'sum') return renderSummary(body, ch, prev, next);
      const key = id + ':' + t;
      const sess = chSession[key] || (chSession[key] = { idx: 0, picks: {} });
      const qs = t === 'mc' ? (ch.quizzes || []) : (ch.ox || []);
      mountQuiz(body, qs, sess, {
        doneText: `${ch.number}장 ${t === 'mc' ? '4지선다' : 'OX'} 풀이 완료`,
        emptyText: t === 'mc' ? '이 장에는 4지선다 문제가 아직 없어요.' : '이 장에는 OX 문제가 아직 없어요.'
      });
    }
    render(tab);
  }

  function renderSummary(body, ch, prev, next) {
    const blocks = (ch.notes || []).map(n => `
      <section class="card sum-card">
        <h3>${fmt(n.title)}</h3>
        ${(n.tags || []).length ? `<div class="terms">${n.tags.map(t => `<span class="term">#${esc(t)}</span>`).join('')}</div>` : ''}
        <div class="note-body">${noteBody(n)}</div>
      </section>`).join('');
    const done = !!S.done[ch.id];
    const s = chStats(ch);
    body.innerHTML = `
      <div class="stack sum-body">${blocks || '<div class="empty">요약이 아직 없어요.</div>'}</div>
      <div class="stack" style="margin-top:18px">
        <button class="btn block ${done ? 'ok' : ''}" id="doneBtn">${done ? '✓ 학습 완료' : '학습 완료로 표시'}</button>
        ${s.mc ? `<a class="btn primary block" href="#/ch/${ch.id}?tab=mc" data-go="mc">4지선다 풀러 가기 (${s.mc})</a>` : ''}
        ${s.ox ? `<a class="btn block" href="#/ch/${ch.id}?tab=ox" data-go="ox">OX 풀러 가기 (${s.ox})</a>` : ''}
        <div class="btn-row">
          ${prev ? `<a class="btn sm" href="#/ch/${prev.id}">‹ ${prev.number}장</a>` : '<span></span>'}
          ${next ? `<a class="btn sm" href="#/ch/${next.id}">${next.number}장 ›</a>` : '<span></span>'}
        </div>
      </div>`;
    body.querySelector('#doneBtn').addEventListener('click', e => {
      if (S.done[ch.id]) delete S.done[ch.id]; else S.done[ch.id] = Date.now();
      save();
      const on = !!S.done[ch.id];
      e.currentTarget.classList.toggle('ok', on);
      e.currentTarget.textContent = on ? '✓ 학습 완료' : '학습 완료로 표시';
      if (on) toast('학습 완료! 진도율에 반영했어요.');
    });
    body.querySelectorAll('[data-go]').forEach(a => a.addEventListener('click', e => {
      e.preventDefault();
      $app.querySelector(`.seg button[data-tab="${a.dataset.go}"]`).click();
    }));
  }

  /* ---------------- 공용 풀이 엔진 ---------------- */
  function mountQuiz(body, qs, sess, opts = {}) {
    if (!qs.length) { body.innerHTML = `<div class="empty"><div class="big">📭</div>${opts.emptyText || '문제가 없어요.'}</div>`; return; }
    if (sess.idx > qs.length) sess.idx = 0;

    function draw() {
      if (sess.idx >= qs.length) return drawScore();
      const q = qs[sess.idx];
      const pick = sess.picks[q.id];
      const answered = pick != null;
      const inNote = !!S.note[q.id];
      const rec = S.ans[q.id];
      const solvedN = qs.filter(x => sess.picks[x.id] != null).length;
      const isOx = q.kind === 'ox';

      const optsHtml = q.options.map((o, k) => {
        const n = k + 1;
        let cls = '';
        if (answered) {
          if (n === q.answer) cls = 'correct';
          else if (n === pick) cls = 'wrong';
          else cls = 'dim';
        }
        return `<button class="opt ${cls}" data-n="${n}" ${answered ? 'disabled' : ''}><span class="n">${isOx ? (n === 1 ? 'O' : 'X') : n}</span><span>${fmt(o)}</span></button>`;
      }).join('');

      const ok = answered && pick === q.answer;
      body.innerHTML = `
        <div class="card">
          <div class="q-top">
            <span class="q-count">${sess.idx + 1} / ${qs.length}</span>
            ${kindTag(q)}
            ${q.source ? `<span class="tag">${esc(q.source)}</span>` : ''}
            ${opts.showChapter ? `<a class="tag" href="#/ch/${q.chapter.id}">${q.chapter.number}장 ${esc(q.chapter.title)}</a>` : ''}
            ${rec && !answered ? `<span class="small muted" style="margin-left:auto">이전: ${rec.ok ? '<span style="color:var(--ok)">정답</span>' : '<span style="color:var(--bad)">오답</span>'}${rec.w ? ` · 오답 ${rec.w}회` : ''}</span>` : ''}
          </div>
          <div class="q-progress"><i style="width:${pct(solvedN, qs.length)}%"></i></div>
          ${isOx ? '<p class="small muted" style="margin:0 0 6px;font-weight:700">다음 설명이 맞으면 O, 틀리면 X</p>' : ''}
          <p class="q-text">${fmt(q.question)}</p>
          <div class="opts ${isOx ? 'ox' : ''}">${optsHtml}</div>
          ${answered ? `
            <details class="result ${ok ? 'ok' : 'bad'}" open>
              <summary>${ok ? '정답입니다!' : `오답이에요 · 정답 ${isOx ? (q.answer === 1 ? 'O' : 'X') : CIRCLE[q.answer - 1]}`}${chev}</summary>
              <div class="explain">${fmt(q.explanation)}</div>
            </details>` : ''}
          <div class="q-actions">
            <button class="btn sm toggle-note ${inNote ? 'on' : ''}" id="noteBtn">${inNote ? '★ 오답노트에 있음 (제외)' : '☆ 오답노트에 추가'}</button>
            ${answered ? '<button class="btn sm" id="retryBtn">다시 풀기</button>' : ''}
          </div>
        </div>
        <div class="q-nav">
          <button class="btn" id="prevBtn" ${sess.idx === 0 ? 'disabled style="opacity:.4"' : ''}>이전</button>
          <button class="btn ${answered ? 'primary' : ''}" id="nextBtn">${sess.idx === qs.length - 1 ? '결과 보기' : '다음'}</button>
        </div>`;

      if (opts.header) opts.header(body);

      body.querySelectorAll('.opt').forEach(b => b.addEventListener('click', () => choose(+b.dataset.n)));
      body.querySelector('#noteBtn').addEventListener('click', () => {
        if (S.note[q.id]) { delete S.note[q.id]; toast('오답노트에서 제외했어요'); }
        else { S.note[q.id] = Date.now(); toast('오답노트에 추가했어요'); }
        save(); draw();
      });
      const rb = body.querySelector('#retryBtn');
      if (rb) rb.addEventListener('click', () => { delete sess.picks[q.id]; draw(); });
      body.querySelector('#prevBtn').addEventListener('click', () => go(sess.idx - 1));
      body.querySelector('#nextBtn').addEventListener('click', () => go(sess.idx + 1));

      if (answered) {
        const r = body.querySelector('.result');
        if (r && r.getBoundingClientRect().bottom > window.innerHeight) {
          r.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    }

    function choose(n) {
      const q = qs[sess.idx];
      if (!q || sess.picks[q.id] != null) return;
      if (n < 1 || n > q.options.length) return;
      sess.picks[q.id] = n;
      recordAnswer(q, n);
      if (opts.onAnswer) opts.onAnswer(q, n);
      draw();
    }
    function go(i) {
      if (i < 0 || i > qs.length) return;
      sess.idx = i;
      if (opts.onMove) opts.onMove();
      draw();
      const top = body.getBoundingClientRect().top + window.scrollY - 130;
      if (window.scrollY > top) window.scrollTo({ top: Math.max(0, top) });
    }

    function drawScore() {
      const answered = qs.filter(q => sess.picks[q.id] != null);
      const ok = answered.filter(q => sess.picks[q.id] === q.answer).length;
      const wrong = answered.filter(q => sess.picks[q.id] !== q.answer);
      body.innerHTML = `
        <div class="card score">
          <div class="muted small" style="font-weight:700">${opts.doneText || '풀이 완료'}</div>
          <div class="big">${ok} <span class="muted" style="font-size:22px">/ ${qs.length}</span></div>
          <div class="muted">정답률 ${pct(ok, answered.length)}% · 안 푼 문제 ${qs.length - answered.length}개</div>
          <div class="bar" style="margin:14px auto 0;max-width:260px"><i style="width:${pct(ok, qs.length)}%;background:var(--ok)"></i></div>
        </div>
        <div class="stack" style="margin-top:12px">
          ${wrong.length ? `<button class="btn primary block" id="wrongOnly">틀린 ${wrong.length}문제만 다시 풀기</button>` : ''}
          <button class="btn block" id="again">처음부터 다시 풀기</button>
          <button class="btn block" id="review">문제 다시 보기</button>
        </div>
        ${opts.after || ''}`;
      if (opts.header) opts.header(body);
      const wo = body.querySelector('#wrongOnly');
      if (wo) wo.addEventListener('click', () => startPlay('retry', wrong.map(q => q.id), '틀린 문제 다시 풀기'));
      body.querySelector('#again').addEventListener('click', () => { sess.picks = {}; sess.idx = 0; if (opts.onMove) opts.onMove(); draw(); });
      body.querySelector('#review').addEventListener('click', () => go(0));
    }

    const onKey = e => {
      if (e.target.matches('input, textarea, select')) return;
      const q = qs[sess.idx];
      if (!q) return;
      if (q.kind === 'ox') {
        if (/^[oO]$/.test(e.key)) choose(1);
        else if (/^[xX]$/.test(e.key)) choose(2);
        else if (/^[12]$/.test(e.key)) choose(+e.key);
      } else if (/^[1-4]$/.test(e.key)) choose(+e.key);
      if (e.key === 'ArrowRight') go(sess.idx + 1);
      else if (e.key === 'ArrowLeft') go(sess.idx - 1);
    };
    document.addEventListener('keydown', onKey);
    cleanup = () => document.removeEventListener('keydown', onKey);
    draw();
  }

  /* ---------------- 세션 풀이 ---------------- */
  const playMem = {};
  function startPlay(mode, ids, title) {
    const sess = { ids, title, idx: 0, picks: {} };
    try { sessionStorage.setItem('sanangi.play.' + mode, JSON.stringify(sess)); } catch (e) { }
    playMem[mode] = sess;
    if (location.hash === '#/play/' + mode) route(); else location.hash = '#/play/' + mode;
  }

  function viewPlay(mode) {
    let sess = playMem[mode];
    if (!sess) { try { sess = JSON.parse(sessionStorage.getItem('sanangi.play.' + mode) || 'null'); } catch (e) { } }
    if (!sess) { location.hash = mode === 'wrong' ? '#/wrong' : (mode === 'ox' ? '#/ox' : '#/random'); return; }
    playMem[mode] = sess;
    const tab = mode === 'ox' ? 'ox' : (mode === 'wrong' ? 'wrong' : 'random');
    setChrome({ title: sess.title || '문제 풀이', back: true, tab });
    const qs = sess.ids.map(id => DB.q[id]).filter(Boolean);
    const persist = () => { try { sessionStorage.setItem('sanangi.play.' + mode, JSON.stringify(sess)); } catch (e) { } };
    const backTo = mode === 'wrong' ? '#/wrong' : (mode === 'ox' ? '#/ox' : '#/random');
    const backLabel = mode === 'wrong' ? '오답노트로 돌아가기' : (mode === 'ox' ? '새 OX 퀴즈 만들기' : '새 랜덤 풀이 만들기');
    $app.innerHTML = '<div id="playBody"></div>';
    mountQuiz($app.querySelector('#playBody'), qs, sess, {
      showChapter: true, onAnswer: persist, onMove: persist,
      doneText: sess.title,
      after: `<a class="btn block ghost" style="margin-top:8px" href="${backTo}">${backLabel}</a>`
    });
  }

  /* ---------------- OX 퀴즈 / 랜덤 풀이 (탭을 누르면 바로 전체 풀이) ---------------- */
  // mode: 'ox'(OX 지문 전체) | 'random'(4지선다 전체)
  const SHUF_KEY = mode => 'sanangi.sess.' + mode;
  const shufSess = {};

  function poolOf(mode, subject) {
    const kind = mode === 'ox' ? 'ox' : 'mc';
    return Object.values(DB.q).filter(q => q.kind === kind && (subject === 'all' || q.chapter.subject === subject));
  }
  function newShufSession(mode, subject) {
    const ids = shuffle(poolOf(mode, subject)).map(q => q.id);
    shufSess[mode] = { subject, ids, idx: 0, picks: {} };
    persistShuf(mode);
    return shufSess[mode];
  }
  function persistShuf(mode) {
    try { sessionStorage.setItem(SHUF_KEY(mode), JSON.stringify(shufSess[mode])); } catch (e) { }
  }
  function loadShufSession(mode) {
    if (shufSess[mode]) return shufSess[mode];
    try { shufSess[mode] = JSON.parse(sessionStorage.getItem(SHUF_KEY(mode)) || 'null'); } catch (e) { shufSess[mode] = null; }
    return shufSess[mode];
  }

  function viewShuffle(mode, query) {
    const isOx = mode === 'ox';
    setChrome({ title: isOx ? 'OX 퀴즈' : '랜덤 풀이', tab: mode });
    const want = query.get('s');
    let sess = loadShufSession(mode);
    const subject = want || (sess && sess.subject) || S.subject;
    const fresh = query.get('new') === '1';
    const valid = sess && sess.subject === subject && sess.ids.length && sess.ids.every(id => DB.q[id]);
    if (fresh || !valid) sess = newShufSession(mode, subject);
    if (fresh) history.replaceState(null, '', '#/' + mode);

    if (!sess.ids.length) {
      $app.innerHTML = `<h1 class="h1">${isOx ? 'OX 퀴즈' : '랜덤 풀이'}</h1>${shufBar(mode, subject)}
        <div class="empty"><div class="big">📭</div>이 과목에는 ${isOx ? 'OX 지문' : '4지선다 문제'}이 아직 없어요.</div>`;
      bindShufBar(mode, subject);
      return;
    }

    const qs = sess.ids.map(id => DB.q[id]).filter(Boolean);
    $app.innerHTML = '<div id="shufBody"></div>';
    mountQuiz($app.querySelector('#shufBody'), qs, sess, {
      showChapter: true,
      onAnswer: () => persistShuf(mode), onMove: () => persistShuf(mode),
      doneText: `${isOx ? 'OX 퀴즈' : '랜덤 풀이'} ${qs.length}문제`,
      header: body => {
        const bar = document.createElement('div');
        bar.innerHTML = shufBar(mode, subject);
        body.prepend(bar.firstElementChild);
        bindShufBar(mode, subject);
      }
    });
  }

  function shufBar(mode, subject) {
    const subs = liveSubjects();
    const chips = subs.map(s => `<a class="chip ${s.id === subject ? 'on' : ''}" href="#/${mode}?s=${s.id}&new=1">${esc(s.short)}</a>`).join('');
    const n = poolOf(mode, subject).length;
    return `<div class="ox-bar">
      <div class="filter">${chips}</div>
      <div class="filter"><span class="small muted" style="align-self:center;font-weight:700">전체 ${n}문제</span>
        <button class="btn sm" id="shufNew" style="margin-left:auto">랜덤 섞기</button></div>
    </div>`;
  }
  function bindShufBar(mode, subject) {
    const nb = $app.querySelector('#shufNew');
    if (nb) nb.addEventListener('click', () => { newShufSession(mode, subject); route(); });
  }

  /* ---------------- 오답노트 ---------------- */
  function viewWrong(query) {
    setChrome({ title: '오답노트', tab: 'wrong' });
    const filter = query.get('s') || 'all';
    Object.keys(S.note).forEach(id => { if (!DB.q[id]) delete S.note[id]; });
    const items = Object.keys(S.note).map(id => DB.q[id])
      .filter(q => filter === 'all' || q.chapter.subject === filter)
      .sort((a, b) => a.id < b.id ? -1 : 1);

    const subjChips = liveSubjects().length > 1
      ? `<div class="filter"><a class="chip ${filter === 'all' ? 'on' : ''}" href="#/wrong">전체</a>${liveSubjects().map(s => `<a class="chip ${filter === s.id ? 'on' : ''}" href="#/wrong?s=${s.id}">${esc(s.short)}</a>`).join('')}</div>` : '';

    if (!items.length) {
      $app.innerHTML = `<h1 class="h1">오답노트</h1>${subjChips}
        <div class="empty"><div class="big">🎉</div>오답노트가 비어 있어요.<br><span class="small">틀린 문제는 자동으로 여기에 모이고,<br>문제 화면에서 직접 추가할 수도 있어요.</span></div>`;
      return;
    }
    const byCh = {};
    for (const q of items) (byCh[q.chapter.id] = byCh[q.chapter.id] || []).push(q);

    $app.innerHTML = `
      <h1 class="h1">오답노트</h1>
      <p class="sub">틀린 문제와 직접 추가한 문제 ${items.length}개</p>
      ${subjChips}
      <div class="btn-row" style="margin-bottom:6px">
        <button class="btn primary" id="playAll">전체 다시 풀기</button>
        <button class="btn" id="playShuffle">섞어서 풀기</button>
      </div>
      ${Object.values(byCh).map(qs => {
        const ch = qs[0].chapter;
        return `<div class="h2">${ch.number}장. ${esc(ch.title)} <span class="muted">${qs.length}</span></div>
        <div class="stack">${qs.map(q => {
          const a = S.ans[q.id];
          return `<div class="card wn-item">
            <div class="q">${fmt(q.question)}</div>
            <div class="m">${kindTag(q)}${a ? `<span>오답 ${a.w}회 · 최근 ${a.ok ? '<span style="color:var(--ok)">정답</span>' : '<span style="color:var(--bad)">오답</span>'}</span>` : '<span>직접 추가</span>'}
              <span class="grow"></span>
              <button class="btn sm" data-one="${q.id}">풀기</button>
              <button class="btn sm ghost" data-del="${q.id}">제외</button></div>
          </div>`;
        }).join('')}</div>`;
      }).join('')}`;

    const allIds = items.map(q => q.id);
    $app.querySelector('#playAll').addEventListener('click', () => startPlay('wrong', allIds, '오답노트 풀이'));
    $app.querySelector('#playShuffle').addEventListener('click', () => startPlay('wrong', shuffle(allIds), '오답노트 풀이'));
    $app.querySelectorAll('[data-one]').forEach(b => b.addEventListener('click', () => startPlay('wrong', [b.dataset.one], '오답노트 풀이')));
    $app.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
      delete S.note[b.dataset.del]; save(); toast('오답노트에서 제외했어요'); route();
    }));
  }

  /* ---------------- 시작 ---------------- */
  try {
    buildDB();
    updateBadge();
    route();
  } catch (e) {
    console.error(e);
    $app.innerHTML = `<div class="empty"><div class="big">⚠️</div>데이터를 불러오지 못했어요.<br><span class="small">${esc(e.message)}</span></div>`;
  }
})();
