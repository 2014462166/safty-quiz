/* ==========================================================================
   安全题库 · 随机测验
   ========================================================================== */
(function () {
  'use strict';

  const ALL = (window.QUESTION_BANK && window.QUESTION_BANK.questions) || [];
  const TYPE_NAME = { single: '单选题', multi: '多选题', judge: '判断题' };
  const TYPE_TAG = { single: 'tag', multi: 'tag tag--multi', judge: 'tag tag--judge' };
  const JUDGE_OPTIONS = [{ label: 'A', text: '正确' }, { label: 'B', text: '错误' }];
  const RING_C = 2 * Math.PI * 86;
  const $ = (id) => document.getElementById(id);

  const state = {
    types: new Set(['single', 'multi', 'judge']),
    count: 20,
    quiz: null,
    timer: null
  };

  /* ----------------------------- 工具 ----------------------------- */
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const fmtTime = (s) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');

  const pad2 = (n) => String(n).padStart(2, '0');

  function extractSource(stem) {
    const m = stem.match(/依据[^《]{0,12}《([^》]{2,60})》/) || stem.match(/《([^》]{2,60})》/);
    return m ? m[1] : '';
  }

  function stemHtml(stem) {
    return esc(stem).replace(/[（(]\s*[）)]/g, '<span class="blank">（　）</span>');
  }

  /* --------------------------- 题目规范化 --------------------------- */
  function normalize(q) {
    if (q.type === 'judge') {
      return { options: JUDGE_OPTIONS, answer: [q.answer === '正确' ? 'A' : 'B'] };
    }
    return { options: q.options, answer: q.answer.slice().sort() };
  }

  /* ---------------------------- 设置页 ---------------------------- */
  const pool = () => ALL.filter((q) => state.types.has(q.type));
  const poolSize = () => pool().length;

  function clampCount(n) {
    const max = Math.max(1, poolSize());
    n = parseInt(n, 10);
    if (!Number.isFinite(n)) n = 1;
    return Math.min(max, Math.max(1, n));
  }

  function syncSetup() {
    const max = poolSize();
    state.count = clampCount(state.count);
    $('poolSize').textContent = max;
    $('countRange').max = max;
    $('countRange').value = state.count;
    $('countRange').style.setProperty('--pct', ((state.count / max) * 100).toFixed(1) + '%');
    $('countInput').value = state.count;
    $('countInput').max = max;
    $('countTip').innerHTML = max
      ? `将从 <b>${max}</b> 道题中随机抽取 <b>${state.count}</b> 道`
      : '请至少选择一种题型';
    [...$('quickPick').children].forEach((b) => {
      const v = b.dataset.count;
      b.classList.toggle('is-on', v === 'all' ? state.count === max : Number(v) === state.count);
    });
  }

  function setCount(n) {
    state.count = clampCount(n);
    syncSetup();
  }

  /* ---------------------------- 开始答题 ---------------------------- */
  function startQuiz(list) {
    const picked = list || shuffle(pool()).slice(0, state.count);
    if (!picked.length) return;
    state.quiz = {
      list: picked,
      idx: 0,
      records: picked.map(() => ({ picked: [], submitted: false, correct: false })),
      startedAt: Date.now(),
      elapsed: 0
    };
    $('qTotal').textContent = picked.length;
    clearInterval(state.timer);
    state.timer = setInterval(() => {
      if (!state.quiz) return;
      state.quiz.elapsed = Math.floor((Date.now() - state.quiz.startedAt) / 1000);
      $('hudTimer').textContent = fmtTime(state.quiz.elapsed);
    }, 1000);
    $('hudTimer').textContent = '00:00';
    $('hudOk').textContent = '0';
    $('hudBad').textContent = '0';
    showScreen('screenQuiz');
    renderQuestion();
  }

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('is-active', s.id === id));
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  /* ---------------------------- 渲染题目 ---------------------------- */
  function renderQuestion() {
    const quiz = state.quiz;
    const q = quiz.list[quiz.idx];
    const rec = quiz.records[quiz.idx];
    const { options, answer } = normalize(q);

    $('qIndex').textContent = quiz.idx + 1;
    $('qNo').textContent = pad2(quiz.idx + 1);
    $('qType').textContent = TYPE_NAME[q.type];
    $('qType').className = TYPE_TAG[q.type];

    const src = extractSource(q.stem);
    $('qSrc').textContent = src ? `依据 · ${src}` : '';
    $('qSrc').hidden = !src;

    $('qStem').innerHTML = stemHtml(q.stem);
    $('railFill').style.width = ((quiz.idx + 1) / quiz.list.length) * 100 + '%';

    const box = $('qOpts');
    box.innerHTML = '';
    options.forEach((o) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'opt';
      btn.dataset.label = o.label;
      btn.innerHTML = `<span class="opt__k">${o.label}</span><span class="opt__t">${esc(o.text)}</span><span class="opt__flag"></span>`;
      btn.addEventListener('click', () => onPick(o.label));
      btn.addEventListener('mousemove', (e) => {
        const r = btn.getBoundingClientRect();
        btn.style.setProperty('--mx', e.clientX - r.left + 'px');
        btn.style.setProperty('--my', e.clientY - r.top + 'px');
      });
      box.appendChild(btn);
    });

    if (rec.submitted) paintResult(q, rec, options, answer, false);
    else {
      $('qFeedback').hidden = true;
      box.querySelectorAll('.opt').forEach((el) => {
        el.classList.toggle('is-picked', rec.picked.includes(el.dataset.label));
      });
    }
    renderActions();
  }

  function renderActions() {
    const quiz = state.quiz;
    const rec = quiz.records[quiz.idx];
    const q = quiz.list[quiz.idx];
    const isLast = quiz.idx === quiz.list.length - 1;

    $('prevBtn').disabled = quiz.idx === 0;
    const submit = $('submitBtn');
    submit.hidden = !(q.type === 'multi' && !rec.submitted);
    submit.disabled = !rec.picked.length;
    const next = $('nextBtn');
    next.textContent = isLast ? '查看结果' : '下一题';
    next.className = 'btn ' + (rec.submitted || isLast ? 'btn--primary' : 'btn--ghost');
  }

  function onPick(label) {
    const quiz = state.quiz;
    const rec = quiz.records[quiz.idx];
    const q = quiz.list[quiz.idx];
    if (rec.submitted) return;

    if (q.type === 'multi') {
      const i = rec.picked.indexOf(label);
      if (i >= 0) rec.picked.splice(i, 1);
      else rec.picked.push(label);
      rec.picked.sort();
      $('qOpts').querySelectorAll('.opt').forEach((el) => {
        el.classList.toggle('is-picked', rec.picked.includes(el.dataset.label));
      });
      renderActions();
      return;
    }
    rec.picked = [label];
    $('qOpts').querySelectorAll('.opt').forEach((el) => {
      el.classList.toggle('is-picked', el.dataset.label === label);
    });
    judge();
  }

  function submitAnswer() {
    const rec = state.quiz.records[state.quiz.idx];
    if (!rec.picked.length) return;
    judge();
  }

  function judge() {
    const quiz = state.quiz;
    const q = quiz.list[quiz.idx];
    const rec = quiz.records[quiz.idx];
    const { options, answer } = normalize(q);
    rec.submitted = true;
    rec.correct = rec.picked.slice().sort().join('') === answer.join('');
    paintResult(q, rec, options, answer, true);
    updateHud();
    renderActions();
  }

  function paintResult(q, rec, options, answer, animate) {
    const box = $('qOpts');
    box.querySelectorAll('.opt').forEach((el) => {
      const L = el.dataset.label;
      const isRight = answer.includes(L);
      const isYou = rec.picked.includes(L);
      el.classList.add('is-locked');
      el.classList.remove('is-picked');
      el.querySelector('.opt__flag').textContent = '';
      if (isRight) {
        el.classList.add('is-ok');
        el.querySelector('.opt__flag').textContent = '正确答案';
      } else if (isYou) {
        el.classList.add('is-bad');
        el.querySelector('.opt__flag').textContent = '你的选择';
      } else {
        el.classList.add('is-dim');
      }
    });

    const fb = $('qFeedback');
    fb.hidden = false;
    fb.className = 'fb ' + (rec.correct ? 'fb--ok' : 'fb--bad');
    if (animate === false) fb.style.animation = 'none';

    const rightTxt = answer
      .map((L) => (options.find((o) => o.label === L) || {}).text)
      .join(' / ');
    let note = '';
    if (q.type === 'judge' && q.fix) note = `<div class="fb__note">更正要点：${esc(q.fix)}</div>`;

    fb.innerHTML = `
      <span class="fb__icon">${rec.correct ? '✓' : '✕'}</span>
      <div class="fb__body">
        ${rec.correct ? '回答正确' : '回答错误，正确答案：<b>' + esc(answer.join('')) + '</b>'}
        ${q.type === 'multi' || !rec.correct ? `<div class="fb__note">正确选项：${esc(rightTxt)}</div>` : ''}
        ${note}
      </div>`;
  }

  function updateHud() {
    const recs = state.quiz.records;
    let ok = 0, bad = 0;
    recs.forEach((r) => {
      if (!r.submitted) return;
      if (r.correct) ok++; else bad++;
    });
    $('hudOk').textContent = ok;
    $('hudBad').textContent = bad;
  }

  function go(delta) {
    const quiz = state.quiz;
    const n = quiz.idx + delta;
    if (n < 0) return;
    if (n >= quiz.list.length) return finishQuiz();
    quiz.idx = n;
    renderQuestion();
  }

  /* ----------------------------- 结果 ----------------------------- */
  function finishQuiz() {
    const quiz = state.quiz;
    clearInterval(state.timer);
    quiz.elapsed = Math.floor((Date.now() - quiz.startedAt) / 1000);

    let ok = 0, bad = 0, blank = 0;
    quiz.records.forEach((r) => {
      if (!r.submitted) blank++;
      else if (r.correct) ok++;
      else bad++;
    });
    const total = quiz.list.length;
    const pct = Math.round((ok / total) * 100);

    const grade = pct >= 90 ? ['安全标兵', '熟练掌握，保持状态。'] :
      pct >= 80 ? ['表现优秀', '再接再厉，注意个别细节条款。'] :
      pct >= 60 ? ['基本合格', '重点复习错题涉及的管理办法条款。'] :
      ['仍需加强', '建议通读题库与相关安全规程后再测一次。'];

    $('scorePct').textContent = pct;
    $('resultTitle').textContent = grade[0];
    $('resultSub').textContent = grade[1];
    $('stOk').textContent = ok;
    $('stBad').textContent = bad;
    $('stBlank').textContent = blank;
    $('stTime').textContent = fmtTime(quiz.elapsed);

    const bar = $('ringBar');
    const color = pct >= 80 ? 'var(--ok)' : pct >= 60 ? 'var(--cyan)' : 'var(--bad)';
    bar.style.transition = 'none';
    bar.style.stroke = color;
    bar.style.filter = `drop-shadow(0 0 12px ${pct >= 80 ? 'rgba(53,230,168,.6)' : pct >= 60 ? 'rgba(77,216,255,.7)' : 'rgba(255,77,109,.6)'})`;
    bar.style.strokeDashoffset = RING_C;

    renderReview(total);
    $('retryWrongBtn').hidden = ok === total;
    showScreen('screenResult');

    requestAnimationFrame(() => {
      bar.style.transition = 'stroke-dashoffset 1.1s cubic-bezier(.2,.8,.2,1)';
      bar.style.strokeDashoffset = RING_C * (1 - pct / 100);
    });
    if (pct >= 80) confetti();
  }

  function renderReview(total) {
    const quiz = state.quiz;
    const wrap = $('review');
    const wrong = quiz.records
      .map((r, i) => ({ r, q: quiz.list[i], i }))
      .filter((x) => !x.r.correct);

    if (!wrong.length) {
      wrap.innerHTML = `<div class="review__head">错题回顾</div>
        <div class="reviewEmpty">全部 ${total} 题作答正确，未产生错题 🎉</div>`;
      return;
    }

    wrap.innerHTML = `<div class="review__head">错题回顾 · ${wrong.length} 题</div>` + wrong.map(({ r, q, i }) => {
      const { options, answer } = normalize(q);
      const rightTxt = answer.map((L) => (options.find((o) => o.label === L) || {}).text).join(' / ');
      const youTxt = r.submitted
        ? r.picked.map((L) => (options.find((o) => o.label === L) || {}).text).join(' / ')
        : '未作答';
      const fix = q.type === 'judge' && q.fix ? `<div class="reviewItem__fix">更正要点：${esc(q.fix)}</div>` : '';
      return `<div class="reviewItem ${r.submitted ? '' : 'reviewItem--blank'}">
        <div class="reviewItem__top"><span>第 ${pad2(i + 1)} 题</span><span>${TYPE_NAME[q.type]}</span></div>
        <div class="reviewItem__stem">${stemHtml(q.stem)}</div>
        <div class="reviewItem__ans">
          <i>你的答案：<span class="you">${esc(youTxt)}</span></i>
          <i>正确答案：<span class="right">${esc(rightTxt)}</span></i>
        </div>${fix}
      </div>`;
    }).join('');
  }

  /* ----------------------------- 特效 ----------------------------- */
  // 深空星场：缓速下坠 + 明暗闪烁
  function starfield() {
    const cv = $('stars');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0, h = 0, stars = [];

    function build() {
      w = window.innerWidth;
      h = window.innerHeight;
      cv.width = w * dpr;
      cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(Math.min(230, Math.max(90, (w * h) / 9000)));
      stars = Array.from({ length: n }, () => {
        const t = Math.random();
        return {
          x: Math.random() * w,
          y: Math.random() * h,
          r: Math.random() * 1.5 + .35,
          a: Math.random() * .55 + .25,
          tw: Math.random() * Math.PI * 2,
          tws: .008 + Math.random() * .022,
          vy: .012 + Math.random() * .05,
          tint: t < .2 ? '124,92,255' : t < .45 ? '77,216,255' : '255,255,255'
        };
      });
    }

    build();
    window.addEventListener('resize', build);

    (function frame() {
      ctx.clearRect(0, 0, w, h);
      stars.forEach((s) => {
        if (!reduce) {
          s.tw += s.tws;
          s.y += s.vy;
          if (s.y > h + 2) { s.y = -2; s.x = Math.random() * w; }
        }
        const alpha = s.a * (.6 + .4 * Math.sin(s.tw));
        if (s.r > 1.05) {
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r * 3.4, 0, 6.2832);
          ctx.fillStyle = `rgba(${s.tint},${(alpha * .1).toFixed(3)})`;
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, 6.2832);
        ctx.fillStyle = `rgba(${s.tint},${alpha.toFixed(3)})`;
        ctx.fill();
      });
      requestAnimationFrame(frame);
    })();
  }

  function confetti() {
    const cv = $('fx');
    const ctx = cv.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const colors = ['#4dd8ff', '#7c5cff', '#ff4fd8', '#ffffff', '#35e6a8'];
    const parts = [];
    for (let i = 0; i < 130; i++) {
      parts.push({
        x: Math.random() * innerWidth,
        y: -30 - Math.random() * innerHeight * .5,
        w: 5 + Math.random() * 7, h: 8 + Math.random() * 10,
        vy: 2.2 + Math.random() * 3.6, vx: -1.3 + Math.random() * 2.6,
        rot: Math.random() * 6.28, vr: -.14 + Math.random() * .28,
        c: colors[i % colors.length]
      });
    }
    let t = 0;
    (function loop() {
      t++;
      cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      ctx.globalAlpha = Math.max(0, 1 - t / 200);
      parts.forEach((p) => {
        p.x += p.vx; p.y += p.vy; p.vy += .035; p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      if (t < 200) requestAnimationFrame(loop);
      else ctx.clearRect(0, 0, innerWidth, innerHeight);
    })();
  }

  /* ----------------------------- 事件 ----------------------------- */
  function bind() {
    $('bankTotal').textContent = ALL.length;

    $('typeChips').addEventListener('click', (e) => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      const t = btn.dataset.type;
      if (state.types.has(t)) {
        if (state.types.size === 1) return;
        state.types.delete(t);
        btn.classList.remove('is-on');
      } else {
        state.types.add(t);
        btn.classList.add('is-on');
      }
      syncSetup();
    });

    $('quickPick').addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      setCount(btn.dataset.count === 'all' ? poolSize() : Number(btn.dataset.count));
    });

    $('countRange').addEventListener('input', (e) => setCount(e.target.value));
    $('countInput').addEventListener('change', (e) => setCount(e.target.value));
    $('minusBtn').addEventListener('click', () => setCount(state.count - 1));
    $('plusBtn').addEventListener('click', () => setCount(state.count + 1));

    $('startBtn').addEventListener('click', () => startQuiz());
    $('prevBtn').addEventListener('click', () => go(-1));
    $('nextBtn').addEventListener('click', () => go(1));
    $('submitBtn').addEventListener('click', submitAnswer);

    $('quitBtn').addEventListener('click', () => {
      const done = state.quiz ? state.quiz.records.filter((r) => r.submitted).length : 0;
      if (!done || confirm(`本轮已作答 ${done} 题，确定退出并放弃本次测验？`)) {
        clearInterval(state.timer);
        state.quiz = null;
        showScreen('screenSetup');
      }
    });

    $('againBtn').addEventListener('click', () => startQuiz());
    $('homeBtn').addEventListener('click', () => { state.quiz = null; showScreen('screenSetup'); });
    $('retryWrongBtn').addEventListener('click', () => {
      const list = state.quiz.records
        .map((r, i) => (r.correct ? null : state.quiz.list[i]))
        .filter(Boolean);
      startQuiz(list);
    });

    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      const quizScreen = $('screenQuiz').classList.contains('is-active');
      const setupScreen = $('screenSetup').classList.contains('is-active');
      if (setupScreen && e.key === 'Enter') { e.preventDefault(); startQuiz(); return; }
      if (!quizScreen || !state.quiz) return;

      const rec = state.quiz.records[state.quiz.idx];
      const key = e.key.toUpperCase();
      const letter = 'ABCD'.includes(key) ? key : ('1234'.includes(key) ? 'ABCD'[Number(key) - 1] : '');
      if (letter && !rec.submitted) {
        const el = $('qOpts').querySelector(`.opt[data-label="${letter}"]`);
        if (el) { e.preventDefault(); onPick(letter); }
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (state.quiz.list[state.quiz.idx].type === 'multi' && !rec.submitted) submitAnswer();
        else go(1);
      } else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    });
  }

  if (!ALL.length) {
    document.body.innerHTML = '<p style="padding:40px;font-family:sans-serif">题库数据加载失败，请检查 assets/questions.js。</p>';
    return;
  }
  starfield();
  bind();
  syncSetup();
})();
