/* ==========================================================================
   安全题库 · 随机测验
   ========================================================================== */
(function () {
  'use strict';

  // 资源版本号：改动资源时递增，避免页面与脚本出现新旧混用的缓存问题
  const VER = '8';

  // 题库注册表：首个随页面加载，其余在切换时按需拉取，避免多余流量
  const BANKS = {
    anquan: { label: '安规题库', file: 'assets/questions-anquan.js?v=' + VER, desc: '安规题库', total: 105 },
    online: { label: '线上课程', file: 'assets/questions-online.js?v=' + VER, desc: '线上课程题库', total: 356 }
  };
  const store = (window.QUESTION_BANKS = window.QUESTION_BANKS || {});
  // 兼容旧版单题库全局变量（window.QUESTION_BANK）
  if (!store.old && window.QUESTION_BANK) store.old = window.QUESTION_BANK;
  const bankOf = (key) => (store[key] && store[key].questions) || null;
  let ALL = [];

  const TYPE_ORDER = ['single', 'multi', 'judge', 'fill'];
  const TYPE_NAME = { single: '单选题', multi: '多选题', judge: '判断题', fill: '填空题' };
  const TYPE_TAG = { single: 'tag', multi: 'tag tag--multi', judge: 'tag tag--judge', fill: 'tag tag--fill' };
  const JUDGE_OPTIONS = [{ label: 'A', text: '正确' }, { label: 'B', text: '错误' }];
  const RING_C = 2 * Math.PI * 86;
  const $ = (id) => document.getElementById(id);

  const state = {
    bank: 'anquan',
    types: new Set(TYPE_ORDER),
    count: 20,
    quiz: null,
    timer: null
  };

  /* ----------------------------- 工具 ----------------------------- */
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // 填空题答案比对：忽略空白与标点，避免因标点差异误判
  const normText = (s) => String(s)
    .replace(/[\s\u3000]/g, '')
    .replace(/[，。、；：？！,.;:?!"'“”‘’（）()《》〈〉【】\[\]·\-—_/\\]/g, '')
    .toLowerCase();

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
    return esc(stem)
      .replace(/[（(]\s*[）)]/g, '<span class="blank">（　）</span>')
      .replace(/_{2,}/g, '<span class="blank">＿＿</span>');
  }

  /* --------------------------- 题目规范化 --------------------------- */
  function normalize(q) {
    if (q.type === 'judge') {
      return { options: JUDGE_OPTIONS, answer: [q.answer === '正确' ? 'A' : 'B'] };
    }
    if (q.type === 'fill') {
      return { options: [], answer: [] };
    }
    // 题库中选项以纯文本数组存储，字母由下标推出（最多可到 H）
    const options = typeof q.options[0] === 'string'
      ? q.options.map((text, i) => ({ label: 'ABCDEFGH'[i], text }))
      : q.options;
    return { options, answer: q.answer.slice().sort() };
  }

  /* ---------------------------- 设置页 ---------------------------- */
  const pool = () => ALL.filter((q) => state.types.has(q.type));
  const poolSize = () => pool().length;

  // 题库按钮按注册表生成，新增题库只需改 BANKS
  function buildBankChips() {
    const box = $('bankChips');
    box.innerHTML = '';
    Object.keys(BANKS).forEach((key) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip';
      btn.dataset.bank = key;
      btn.innerHTML = `<span class="chip__box"></span>${BANKS[key].label}<i>${BANKS[key].total}</i>`;
      box.appendChild(btn);
    });
  }

  const countByType = (list) => list.reduce((a, q) => (a[q.type] = (a[q.type] || 0) + 1, a), {});

  // 题型按钮按当前题库实际拥有的题型生成（没有的题型不显示）
  function buildTypeChips(counts) {
    const box = $('typeChips');
    box.innerHTML = '';
    TYPE_ORDER.filter((t) => counts[t]).forEach((t) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip';
      btn.dataset.type = t;
      btn.innerHTML = `<span class="chip__box"></span>${TYPE_NAME[t]}<i>${counts[t]}</i>`;
      box.appendChild(btn);
    });
  }

  // 首屏统计按当前题库生成
  function buildHeroStats(counts, total) {
    const box = $('heroStats');
    box.innerHTML = TYPE_ORDER.filter((t) => counts[t])
      .map((t) => `<div><b>${counts[t]}</b><span>${TYPE_NAME[t]}</span></div>`).join('')
      + `<div><b>${total}</b><span>题库总量</span></div>`;
  }

  // 按需加载题库脚本，未使用到的题库不产生流量
  function loadBank(key) {
    return new Promise((resolve, reject) => {
      if (bankOf(key)) return resolve();
      const s = document.createElement('script');
      s.src = BANKS[key].file;
      s.onload = () => (bankOf(key) ? resolve() : reject(new Error('empty')));
      s.onerror = () => reject(new Error('network'));
      document.head.appendChild(s);
    });
  }

  function selectBank(key) {
    if (key === state.bank && ALL.length) return;
    if (bankOf(key)) return applyBank(key);
    $('bankHint').textContent = '正在加载' + BANKS[key].label + '…';
    loadBank(key)
      .then(() => applyBank(key))
      .catch(() => {
        $('bankHint').textContent = BANKS[key].label + '加载失败，请检查网络后重试';
      });
  }

  function applyBank(key) {
    state.bank = key;
    ALL = bankOf(key) || [];
    // 该题库缺少的题型自动取消勾选，避免抽到空集合
    const avail = new Set(ALL.map((q) => q.type));
    const kept = [...state.types].filter((t) => avail.has(t));
    state.types = new Set(kept.length ? kept : avail);
    state.count = 20;
    buildTypeChips(countByType(ALL));
    renderBankUI();
    syncSetup();
  }

  function renderBankUI() {
    const counts = countByType(ALL);

    [...$('bankChips').children].forEach((b) => {
      b.classList.toggle('is-on', b.dataset.bank === state.bank);
      const list = bankOf(b.dataset.bank);
      b.querySelector('i').textContent = list ? list.length : BANKS[b.dataset.bank].total;
    });
    [...$('typeChips').children].forEach((b) => {
      b.classList.toggle('is-on', state.types.has(b.dataset.type));
      b.querySelector('i').textContent = counts[b.dataset.type] || 0;
    });

    $('bankHint').textContent = `${BANKS[state.bank].label} · ${BANKS[state.bank].desc} · 共 ${ALL.length} 题`;
    $('bankTotal').textContent = ALL.length;
    buildHeroStats(counts, ALL.length);
  }

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
      records: picked.map(() => ({ picked: [], text: '', submitted: false, correct: false })),
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
    if (q.type === 'fill') {
      const wrap = document.createElement('div');
      wrap.className = 'fill';
      wrap.innerHTML = '<input class="fill__input" id="fillInput" type="text" autocomplete="off" spellcheck="false" placeholder="在此输入答案后点「确认答案」">';
      box.appendChild(wrap);
      const inp = wrap.querySelector('.fill__input');
      inp.value = rec.text || '';
      inp.disabled = !!rec.submitted;
      inp.addEventListener('input', () => { rec.text = inp.value; renderActions(); });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); submitAnswer(); }
      });
    } else {
      options.forEach((o) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'opt';
        btn.dataset.label = o.label;
        btn.innerHTML = `<span class="opt__k">${o.label}</span><span class="opt__t">${esc(o.text)}</span><span class="opt__flag"></span>`;
        btn.addEventListener('click', () => onPick(o.label));
        box.appendChild(btn);
      });
    }

    if (rec.submitted) paintResult(q, rec, options, answer, false);
    else {
      $('qFeedback').hidden = true;
      box.querySelectorAll('.opt').forEach((el) => {
        el.classList.toggle('is-picked', rec.picked.includes(el.dataset.label));
      });
    }
    // 桌面端自动聚焦输入框；触屏端不自动弹键盘，避免打断浏览
    if (q.type === 'fill' && !rec.submitted && !window.matchMedia('(pointer:coarse)').matches) {
      box.querySelector('.fill__input').focus();
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
    const needSubmit = (q.type === 'multi' || q.type === 'fill') && !rec.submitted;
    submit.hidden = !needSubmit;
    submit.disabled = q.type === 'fill' ? !String(rec.text || '').trim() : !rec.picked.length;
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
    const quiz = state.quiz;
    const q = quiz.list[quiz.idx];
    const rec = quiz.records[quiz.idx];
    if (rec.submitted) return;
    if (q.type === 'fill') {
      if (!String(rec.text || '').trim()) return;
    } else if (!rec.picked.length) return;
    judge();
  }

  function judge() {
    const quiz = state.quiz;
    const q = quiz.list[quiz.idx];
    const rec = quiz.records[quiz.idx];
    const { options, answer } = normalize(q);
    rec.submitted = true;
    rec.correct = q.type === 'fill'
      ? normText(rec.text || '') === normText(q.answer)
      : rec.picked.slice().sort().join('') === answer.join('');
    paintResult(q, rec, options, answer, true);
    updateHud();
    renderActions();
  }

  function paintResult(q, rec, options, answer, animate) {
    const box = $('qOpts');
    const fillInput = box.querySelector('.fill__input');
    if (fillInput) {
      fillInput.disabled = true;
      fillInput.classList.add(rec.correct ? 'is-ok' : 'is-bad');
    }
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

    const isChoice = q.type === 'single' || q.type === 'multi';
    const rightTxt = isChoice
      ? answer.map((L) => (options.find((o) => o.label === L) || {}).text).join(' / ')
      : q.answer;
    let note = '';
    if (q.type === 'judge' && q.fix) note = `<div class="fb__note">更正要点：${esc(q.fix)}</div>`;

    const head = rec.correct
      ? '回答正确'
      : isChoice
        ? '回答错误，正确答案：<b>' + esc(answer.join('')) + '</b>'
        : '回答错误，参考答案：<b>' + esc(q.answer) + '</b>';

    fb.innerHTML = `
      <span class="fb__icon">${rec.correct ? '✓' : '✕'}</span>
      <div class="fb__body">
        ${head}
        ${(q.type === 'multi' || q.type === 'fill' || !rec.correct) ? `<div class="fb__note">${isChoice ? '正确选项' : '参考答案'}：${esc(rightTxt)}</div>` : ''}
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
    const color = pct >= 80 ? 'var(--ok)' : pct >= 60 ? 'var(--accent)' : 'var(--bad)';
    bar.style.stroke = color;
    bar.style.strokeDashoffset = RING_C * (1 - pct / 100);

    renderReview(total);
    $('retryWrongBtn').hidden = ok === total;
    showScreen('screenResult');
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
      const isChoice = q.type === 'single' || q.type === 'multi';
      const rightTxt = isChoice
        ? answer.map((L) => (options.find((o) => o.label === L) || {}).text).join(' / ')
        : q.answer;
      let youTxt = '未作答';
      if (r.submitted) {
        youTxt = isChoice
          ? r.picked.map((L) => (options.find((o) => o.label === L) || {}).text).join(' / ')
          : (r.text || '').trim() || '（空）';
      }
      const fix = q.type === 'judge' && q.fix ? `<div class="reviewItem__fix">更正要点：${esc(q.fix)}</div>` : '';
      return `<div class="reviewItem ${r.submitted ? '' : 'reviewItem--blank'}">
        <div class="reviewItem__top"><span>第 ${pad2(i + 1)} 题</span><span>${TYPE_NAME[q.type]}</span></div>
        <div class="reviewItem__stem">${stemHtml(q.stem)}</div>
        <div class="reviewItem__ans">
          <i>你的答案：<span class="you">${esc(youTxt)}</span></i>
          <i>${isChoice ? '正确答案' : '参考答案'}：<span class="right">${esc(rightTxt)}</span></i>
        </div>${fix}
      </div>`;
    }).join('');
  }

  /* ----------------------------- 事件 ----------------------------- */
  function bind() {
    $('bankChips').addEventListener('click', (e) => {
      const btn = e.target.closest('.chip');
      if (btn) selectBank(btn.dataset.bank);
    });

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
      const letters = 'ABCDEFGH';
      const letter = letters.includes(key) ? key : (/^[1-8]$/.test(key) ? letters[Number(key) - 1] : '');
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

  // 默认题库：注册表中第一个已随页面加载好数据的题库
  const initial = Object.keys(BANKS).find((k) => bankOf(k)) || null;
  if (!initial) {
    document.body.innerHTML = '<p style="padding:40px;font-family:sans-serif">题库数据加载失败，请强制刷新页面（Ctrl+F5 / 长按刷新）后重试。</p>';
    return;
  }
  bind();
  buildBankChips();
  applyBank(initial);
})();
