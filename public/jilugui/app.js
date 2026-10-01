/* 紀錄櫃 APP 前端。純瀏覽器程式，透過 /api/jilugui 讀寫（後端在 app/api/jilugui，共用程式在 lib/jilugui.ts）。
   2026-10 從 Cloudflare Workers 搬到 Vercel；登入改成只輸入登入碼；檔案改傳到 Vercel Blob。 */
(function () {
  'use strict';

  const API = '/api/jilugui';
  const LABEL = { home: '首頁', records: '紀錄', files: '檔案' };
  const STATUS = ['進行中', '已完成', '待追蹤', '取消'];
  const STATUS_CLASS = { '進行中': 'blue', '已完成': 'green', '待追蹤': 'yellow', '取消': 'gray' };
  const CATEGORY = ['工程', '業務', '會議', '採購', '行政', '系統開發', '其他'];
  const FILE_CATEGORY = ['文件', '照片', '合約', '報價與發票', '圖面', '影片', '其他'];
  const PAGE = 30;

  const ICONS = {
    logo: '<svg viewBox="0 0 512 512" aria-hidden="true"><rect width="512" height="512" rx="96" fill="#B4271F"/><rect x="112" y="120" width="288" height="272" rx="20" fill="#F4F5F8"/><rect x="112" y="120" width="288" height="40" rx="20" fill="#1B2230"/><rect x="112" y="140" width="288" height="20" fill="#1B2230"/><rect x="148" y="196" width="216" height="24" rx="12" fill="#1B2230"/><rect x="148" y="250" width="216" height="24" rx="12" fill="#1B2230" opacity=".55"/><rect x="148" y="304" width="150" height="24" rx="12" fill="#B4271F"/><circle cx="256" cy="140" r="12" fill="#F4F5F8"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M10 20v-5h4v5"/></svg>',
    records: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 9h6M9 13h6M9 17h3"/></svg>',
    files: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
    ask: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-5 4z"/><path d="M8 9h8M8 12h5"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  };

  const state = {
    user: null, mode: 'notion', ai: false, appName: '紀錄櫃', view: 'home', painter: null,
    records: freshList(), files: freshList(), active: freshList(), chat: { messages: [], busy: false, open: false }, chatPainter: null,
  };
  function freshList() { return { items: [], cursor: null, loaded: false, loading: false, q: '', filter: '', seq: 0 }; }

  const $app = document.getElementById('app');
  let $main = null;

  // ---------- DOM 小工具 ----------
  function h(tag, props) {
    const el = document.createElement(tag);
    if (props) {
      for (const k in props) {
        const v = props[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'value') el.value = v;
        else if (k.indexOf('on') === 0) el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (let i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, kid) {
    if (kid === null || kid === undefined || kid === false) return;
    if (Array.isArray(kid)) { kid.forEach((k) => add(el, k)); return; }
    el.appendChild(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  function debounce(fn, ms) { let t; return function () { const a = arguments; clearTimeout(t); t = setTimeout(() => fn.apply(null, a), ms); }; }

  // ---------- 格式 ----------
  const WEEK = '日一二三四五六';
  function pad(n) { return String(n).padStart(2, '0'); }
  function today() { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fmtDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
    if (!m) return '未填日期';
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return (+m[2]) + '/' + (+m[3]) + '（' + WEEK.charAt(d.getDay()) + '）';
  }
  function fmtMonth(s) { const m = /^(\d{4})-(\d{2})/.exec(s || ''); return m ? m[1] + ' 年 ' + (+m[2]) + ' 月' : '未填日期'; }
  function fmtTime(iso) {
    const d = new Date(iso); if (isNaN(d)) return '';
    return d.toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function fmtBytes(n) {
    if (!(n >= 0)) return '';
    const u = ['B', 'KB', 'MB', 'GB']; let i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return (i ? n.toFixed(n < 10 ? 1 : 0) : n) + ' ' + u[i];
  }
  function todayLabel() { const d = new Date(); return d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 星期' + WEEK.charAt(d.getDay()); }
  function greeting() { const hr = new Date().getHours(); const g = hr < 11 ? '早安' : hr < 18 ? '午安' : '晚安'; return g + '，' + state.user.name; }
  function extOf(name) { const i = (name || '').lastIndexOf('.'); return i > 0 ? name.slice(i + 1).toUpperCase().slice(0, 6) : ''; }
  function kindOf(name, type) {
    const t = (type || '').toLowerCase(); const e = extOf(name).toLowerCase();
    if (t.indexOf('image/') === 0 || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'svg', 'bmp'].indexOf(e) >= 0) return 'image';
    if (t.indexOf('video/') === 0 || ['mp4', 'mov', 'webm', 'm4v'].indexOf(e) >= 0) return 'video';
    if (t === 'application/pdf' || e === 'pdf') return 'pdf';
    return 'other';
  }
  function guessCategory(file) {
    const k = kindOf(file.name, file.type);
    if (k === 'image') return '照片';
    if (k === 'video') return '影片';
    if (k === 'pdf') return '文件';
    const e = extOf(file.name).toLowerCase();
    if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'csv', 'odt'].indexOf(e) >= 0) return '文件';
    if (['dwg', 'dxf', 'ai', 'psd', 'skp', 'rvt', 'cdr', 'eps'].indexOf(e) >= 0) return '圖面';
    return '其他';
  }
  const MIME = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', svg: 'image/svg+xml', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', txt: 'text/plain', csv: 'text/csv', md: 'text/markdown', json: 'application/json', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', zip: 'application/zip', dwg: 'image/vnd.dwg', ai: 'application/postscript', psd: 'image/vnd.adobe.photoshop' };
  function guessType(name) { return MIME[extOf(name).toLowerCase()] || ''; }
  // 沒有副檔名就無法判斷格式；其他格式交給伺服器決定存 Notion 還是備援空間。
  function unsupportedReason(file) {
    const e = extOf(file.name).toLowerCase();
    if (!e) return '檔名沒有副檔名，無法判斷檔案類型，請先改檔名';
    return '';
  }
  function parseTags(s) { return (s || '').split(/[,，、\s#]+/).map((t) => t.trim()).filter((t, i, a) => t && a.indexOf(t) === i).slice(0, 20); }
  function clip(s, n) { s = s || ''; return s.length > n ? s.slice(0, n) + '…' : s; }
  // 把文字裡的網址變成可點的連結
  function linkified(text, cls, tag) {
    const el = h(tag || 'p', { class: cls });
    const s = String(text || '');
    const re = /(https?:\/\/[^\s<>"'，。）)]+)/g;
    let last = 0, m;
    while ((m = re.exec(s))) {
      if (m.index > last) el.appendChild(document.createTextNode(s.slice(last, m.index)));
      el.appendChild(h('a', { href: m[1], target: '_blank', rel: 'noopener', text: m[1] }));
      last = m.index + m[1].length;
    }
    if (last < s.length) el.appendChild(document.createTextNode(s.slice(last)));
    return el;
  }

  // ---------- 提示 ----------
  let toastTimer = null;
  function toast(msg, kind) {
    let t = document.getElementById('toast');
    if (!t) { t = h('div', { id: 'toast', class: 'toast', role: 'status' }); document.body.appendChild(t); }
    t.textContent = msg; t.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = 'toast'; }, 3200);
  }

  // ---------- API ----------
  async function api(method, path, body) {
    const opts = { method, headers: {}, credentials: 'same-origin' };
    if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    let res;
    try { res = await fetch(API + path, opts); } catch (e) { throw new Error('連不上伺服器，請檢查網路'); }
    let data = {};
    try { data = await res.json(); } catch (e) { data = {}; }
    if (res.status === 401 && path !== '/login' && path !== '/me') { state.user = null; render(); throw new Error(data.error || '請重新登入'); }
    if (!res.ok) throw new Error(data.error || ('發生錯誤（' + res.status + '）'));
    return data;
  }

  async function boot() {
    try {
      const me = await api('GET', '/me');
      state.user = me.user; state.mode = me.mode; state.ai = !!me.ai; state.appName = me.app || state.appName;
    } catch (e) {
      state.user = null;
      try { const r = await fetch(API + '/health'); const j = await r.json(); state.mode = j.mode; state.ai = !!j.ai; state.appName = j.app || state.appName; } catch (e2) { /* 離線 */ }
    }
    document.title = state.appName;
    render();
  }
  async function logout() {
    try { await api('POST', '/logout'); } catch (e) { /* 忽略 */ }
    state.user = null; state.records = freshList(); state.files = freshList(); state.active = freshList(); state.chat = { messages: [], busy: false, open: false }; state.view = 'home';
    render();
  }

  // ---------- 畫面 ----------
  function render() {
    if (state.user) { $app.replaceChildren(shell()); renderView(); }
    else $app.replaceChildren(loginView());
  }

  function loginView() {
    // 只輸入登入碼就能登入：每個人的登入碼不一樣，伺服器用登入碼認出是誰（記錄者照樣會填對）。
    const code = h('input', { id: 'login-code', type: 'password', autocomplete: 'current-password', placeholder: '登入碼', required: true, autofocus: true });
    const err = h('div', { class: 'form-error', id: 'login-error' });
    const btn = h('button', { class: 'btn primary block', type: 'submit', text: '登入' });
    const form = h('form', { class: 'login-form', onsubmit: async (e) => {
      e.preventDefault(); err.textContent = ''; btn.disabled = true;
      try {
        const r = await api('POST', '/login', { code: code.value });
        state.user = r.user; state.mode = r.mode; state.ai = !!r.ai; state.appName = r.app || state.appName;
        render();
      } catch (ex) { err.textContent = ex.message; } finally { btn.disabled = false; }
    } }, code, err, btn);
    return h('div', { class: 'login' }, h('div', { class: 'login-card' },
      h('div', { class: 'login-logo', html: ICONS.logo }),
      h('h1', { class: 'login-title', text: state.appName }),
      h('p', { class: 'login-sub', text: '存放檔案，也記下做過的事。' }),
      form,
      state.mode === 'demo'
        ? h('p', { class: 'hint', text: '示範模式：登入碼「123456」是王小明、「567890」是陳小美。資料只放在記憶體，不會真的存進 Notion。' })
        : h('p', { class: 'hint', text: '輸入自己的登入碼就會登入。登入碼由管理者在 Notion 的「成員」名單設定，每個人一組。' })));
  }

  function shell() {
    $main = h('main', { class: 'main' });
    const tabs = h('nav', { class: 'tabbar', 'aria-label': '主選單' }, Object.keys(LABEL).map((v) =>
      h('button', { class: 'tab' + (state.view === v ? ' active' : ''), 'data-view': v, type: 'button', onclick: () => setView(v) },
        h('span', { class: 'tab-icon', html: ICONS[v] }), h('span', { class: 'tab-label', text: LABEL[v] }))));
    return h('div', { class: 'shell' },
      h('header', { class: 'topbar' },
        h('div', { class: 'brand' }, h('span', { class: 'brand-mark', html: ICONS.logo }), h('span', { class: 'brand-name', text: state.appName }), state.mode === 'demo' ? h('span', { class: 'pill demo', text: '示範' }) : null),
        h('div', { class: 'topbar-right' }, h('button', { class: 'who', type: 'button', title: '帳號設定', text: state.user.name + (state.user.role === 'admin' ? '（管理者）' : ''), onclick: openAccount }), h('button', { class: 'linkbtn', type: 'button', text: '登出', onclick: logout }))),
      tabs, $main,
      h('button', { class: 'fab add', type: 'button', 'aria-label': '新增', title: '新增', html: ICONS.plus, onclick: openAddMenu }),
      h('button', { class: 'fab assistant', type: 'button', 'aria-label': '問紀錄櫃', title: '問紀錄櫃', html: ICONS.ask, onclick: toggleAssistant }),
      assistantPanel());
  }

  function setView(v) {
    state.view = v;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === v));
    if (v === 'home') {
      for (const s of [state.records, state.files]) if (s.q || s.filter) { s.q = ''; s.filter = ''; s.loaded = false; }
    }
    renderView();
    window.scrollTo(0, 0);
  }
  function renderView() {
    $main.replaceChildren(state.view === 'home' ? homeView() : state.view === 'records' ? recordsView() : filesView());
  }
  function repaint() { if (state.painter) state.painter(); }
  function ensureLoaded(s, loader) { if (!s.loaded && !s.loading) loader(true); }

  // ---------- 首頁 ----------
  function homeView() {
    const wrap = h('div', { class: 'view' });
    const statsEl = h('div', { class: 'stats' });
    const boardEl = h('div', { class: 'board' });
    const boardCount = h('span', { class: 'muted small' });
    const recEl = h('div', { class: 'list' });
    const fileEl = h('div', { class: 'grid' });
    wrap.appendChild(h('div', { class: 'greet' }, h('h1', { class: 'page-title', text: greeting() }), h('p', { class: 'muted', text: todayLabel() })));
    wrap.appendChild(statsEl);
    // 進行中的項目：一眼看出每一類現在有哪些事在做、做到哪裡
    wrap.appendChild(h('section', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', { text: '進行中的項目' }), boardCount), boardEl));
    wrap.appendChild(h('section', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', { text: '最近的紀錄' }), h('button', { class: 'linkbtn', type: 'button', text: '看全部', onclick: () => setView('records') })), recEl));
    wrap.appendChild(h('section', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', { text: '最新檔案' }), h('button', { class: 'linkbtn', type: 'button', text: '看全部', onclick: () => setView('files') })), fileEl));
    const paint = () => {
      if (state.view !== 'home') return;
      paintStats(statsEl);
      paintBoard(boardEl, boardCount);
      paintItems(recEl, state.records, 5, recordCard, '還沒有紀錄。按右下角「＋」寫下第一件做過的事。');
      paintItems(fileEl, state.files, 8, fileTile, '還沒有檔案。按右下角「＋」上傳第一個檔案。');
    };
    state.painter = paint;
    paint();
    loadActive();   // 每次回到首頁都重抓，狀態改了馬上反映
    ensureLoaded(state.records, loadRecords);
    ensureLoaded(state.files, loadFiles);
    return wrap;
  }
  function paintStats(el) {
    const recs = state.records.items, files = state.files.items, act = state.active;
    const ym = today().slice(0, 7);
    const tile = (num, label, accent) => h('div', { class: 'stat' + (accent ? ' accent' : '') }, h('div', { class: 'stat-num', text: num }), h('div', { class: 'stat-label', text: label }));
    const plus = (s) => (s.cursor ? '+' : '');
    // 進行中／待追蹤用「進行中的項目」那份完整清單算，數字才準；還沒載入就先用最近的紀錄估
    const count = (st) => (act.loaded ? String(act.items.filter((r) => r.status === st).length) : recs.filter((r) => r.status === st).length + plus(state.records));
    el.replaceChildren(
      tile(recs.filter((r) => (r.date || '').indexOf(ym) === 0).length + (state.records.cursor ? '+' : ''), '本月紀錄', true),
      tile(count('進行中'), '進行中'),
      tile(count('待追蹤'), '待追蹤'),
      tile(files.length + plus(state.files), '檔案'));
  }
  // 細節只取第一行、最多 80 字，當成「現在做到哪」的一句話
  function firstLine(s, n) {
    const line = String(s || '').split(/\r?\n/).map((x) => x.trim()).find((x) => x) || '';
    return clip(line, n);
  }
  function paintBoard(el, countEl) {
    const s = state.active;
    if (!s.loaded && s.loading) { el.replaceChildren(h('div', { class: 'muted', text: '載入中…' })); countEl.textContent = ''; return; }
    if (!s.items.length) { el.replaceChildren(h('div', { class: 'empty', text: s.loaded ? '目前沒有進行中或待追蹤的項目。' : '' })); countEl.textContent = ''; return; }
    countEl.textContent = s.items.length + ' 項';
    // 照分類分組，順序照表單的分類順序；沒填分類的排最後
    const groups = new Map();
    for (const r of s.items) {
      const k = r.category || '未分類';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    }
    const order = CATEGORY.concat(['未分類']).filter((k) => groups.has(k)).concat(Array.from(groups.keys()).filter((k) => CATEGORY.indexOf(k) < 0 && k !== '未分類'));
    el.replaceChildren.apply(el, order.map((k) => {
      const rows = groups.get(k);
      return h('div', { class: 'board-group' },
        h('div', { class: 'board-head' }, h('span', { text: k }), h('span', { class: 'n', text: String(rows.length) })),
        rows.map((r) => h('button', { class: 'brow', type: 'button', onclick: () => openRecord(r) },
          h('div', { class: 'brow-top' }, chip(r.status, STATUS_CLASS[r.status] || 'gray'), h('span', { class: 'brow-title', text: r.title || '（無標題）' })),
          r.note ? h('div', { class: 'brow-note', text: firstLine(r.note, 80) }) : null,
          h('div', { class: 'brow-meta', text: [fmtDate(r.date), r.by, r.fileIds.length ? '附件 ' + r.fileIds.length : '', r.link ? '有連結' : ''].filter(Boolean).join(' · ') }))));
    }));
  }
  function paintItems(el, s, limit, fn, emptyMsg) {
    if (!s.loaded && s.loading) { el.replaceChildren(h('div', { class: 'muted', text: '載入中…' })); return; }
    if (!s.items.length) { el.replaceChildren(h('div', { class: 'empty', text: s.loaded ? emptyMsg : '' })); return; }
    el.replaceChildren.apply(el, s.items.slice(0, limit).map(fn));
  }

  // ---------- 紀錄 ----------
  function recordsView() {
    const s = state.records;
    const wrap = h('div', { class: 'view' });
    const search = h('input', { type: 'search', class: 'search', id: 'search-records', placeholder: '搜尋做了什麼、細節、記錄者', value: s.q, 'aria-label': '搜尋紀錄',
      oninput: debounce((e) => { s.q = e.target.value.trim(); loadRecords(true); }, 350) });
    const chips = h('div', { class: 'chips scroll' }, [''].concat(STATUS).map((st) => h('button', { type: 'button', class: 'chip' + (s.filter === st ? ' active' : ''), 'data-v': st, text: st || '全部',
      onclick: () => { s.filter = st; chips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c.dataset.v === st)); loadRecords(true); } })));
    const listEl = h('div', { class: 'list' });
    const more = h('button', { type: 'button', class: 'btn block more', text: '載入更多', onclick: () => loadRecords(false) });
    wrap.appendChild(h('h1', { class: 'page-title', text: '紀錄' }));
    wrap.appendChild(search); wrap.appendChild(chips); wrap.appendChild(listEl); wrap.appendChild(more);
    const paint = () => {
      if (state.view !== 'records') return;
      paintGroupedRecords(listEl, s);
      more.hidden = !s.cursor; more.disabled = s.loading; more.textContent = s.loading ? '載入中…' : '載入更多';
    };
    state.painter = paint; paint(); ensureLoaded(s, loadRecords);
    return wrap;
  }
  function paintGroupedRecords(el, s) {
    if (!s.loaded && s.loading) { el.replaceChildren(h('div', { class: 'muted', text: '載入中…' })); return; }
    if (!s.items.length) { el.replaceChildren(h('div', { class: 'empty', text: s.loaded ? (s.q || s.filter ? '沒有符合的紀錄。' : '還沒有紀錄。按右下角「＋」寫下第一件做過的事。') : '' })); return; }
    const out = []; let month = null;
    for (const r of s.items) {
      const mk = (r.date || '').slice(0, 7);
      if (mk !== month) { month = mk; out.push(h('h2', { class: 'month', text: fmtMonth(r.date) })); }
      out.push(recordCard(r));
    }
    el.replaceChildren.apply(el, out);
  }
  function chip(text, cls) { return h('span', { class: 'chip-s' + (cls ? ' ' + cls : ''), text }); }
  function recordCard(r) {
    return h('article', { class: 'card', tabindex: 0, role: 'button', onclick: () => openRecord(r), onkeydown: (e) => { if (e.key === 'Enter') openRecord(r); } },
      h('div', { class: 'card-date', text: fmtDate(r.date) }),
      h('div', { class: 'card-body' },
        h('div', { class: 'card-title', text: r.title || '（無標題）' }),
        r.note ? h('div', { class: 'card-note', text: clip(r.note, 90) }) : null,
        h('div', { class: 'chips' }, r.status ? chip(r.status, STATUS_CLASS[r.status] || 'gray') : null, r.category ? chip(r.category) : null, r.tags.map((t) => chip('#' + t, 'tag')), r.fileIds.length ? chip('附件 ' + r.fileIds.length) : null, r.link ? chip('連結') : null),
        h('div', { class: 'card-meta', text: [r.by, r.code].filter(Boolean).join(' · ') })));
  }

  async function openRecord(r) {
    const sh = openSheet(r.title || '（無標題）');
    const b = sh.body;
    b.appendChild(h('div', { class: 'meta', text: [fmtDate(r.date), r.code, r.by ? '記錄者 ' + r.by : ''].filter(Boolean).join(' · ') }));
    b.appendChild(h('div', { class: 'chips' }, r.status ? chip(r.status, STATUS_CLASS[r.status] || 'gray') : null, r.category ? chip(r.category) : null, r.tags.map((t) => chip('#' + t, 'tag'))));
    if (r.link) b.appendChild(h('div', { class: 'linkbox' }, h('a', { class: 'btn primary', href: r.link, target: '_blank', rel: 'noopener', text: '開啟連結' }), h('a', { class: 'link-url', href: r.link, target: '_blank', rel: 'noopener', text: r.link })));
    if (r.note) b.appendChild(linkified(r.note, 'note'));
    const filesEl = h('div', { class: 'grid small' });
    b.appendChild(h('h3', { class: 'sub', text: '相關檔案' + (r.fileIds.length ? '（' + r.fileIds.length + '）' : '') }));
    b.appendChild(filesEl);
    if (r.attachments && r.attachments.length) {
      b.appendChild(h('h3', { class: 'sub', text: 'Notion 附件' }));
      b.appendChild(h('div', { class: 'linklist' }, r.attachments.map((a) => h('a', { class: 'filelink', href: fileUrl(r.id, a.index), target: '_blank', rel: 'noopener', text: a.name }))));
    }
    const actions = h('div', { class: 'actions' });
    actions.appendChild(h('button', { class: 'btn', type: 'button', text: '編輯', onclick: () => openRecordForm(r, sh) }));
    if (canDelete(r.by)) actions.appendChild(h('button', { class: 'btn danger', type: 'button', text: '刪除', onclick: () => confirmBox(actions, '刪除這筆紀錄？相關檔案會保留在檔案庫。', async () => {
      await api('DELETE', '/records/' + r.id);
      state.records.items = state.records.items.filter((x) => x.id !== r.id);
      state.active.items = state.active.items.filter((x) => x.id !== r.id);
      toast('已刪除紀錄'); sh.close(); repaint();
    }) }));
    if (r.notionUrl && state.user.role === 'admin') actions.appendChild(h('a', { class: 'btn', href: r.notionUrl, target: '_blank', rel: 'noopener', text: '在 Notion 開啟' }));
    b.appendChild(actions);
    b.appendChild(h('div', { class: 'meta small', text: ['建立 ' + fmtTime(r.createdAt), r.updatedAt ? '修改 ' + fmtTime(r.updatedAt) : ''].filter(Boolean).join(' · ') }));
    if (!r.fileIds.length) { filesEl.appendChild(h('div', { class: 'muted', text: '沒有相關檔案' })); return; }
    filesEl.appendChild(h('div', { class: 'muted', text: '載入中…' }));
    const files = await Promise.all(r.fileIds.map(cachedFile));
    const ok = files.filter(Boolean);
    filesEl.replaceChildren.apply(filesEl, ok.length ? ok.map(fileTile) : [h('div', { class: 'muted', text: '相關檔案已被刪除' })]);
  }

  function openRecordForm(existing, parentSheet) {
    const sh = openSheet(existing ? '編輯紀錄' : '新增紀錄', { wide: true });
    const f = {
      date: h('input', { type: 'date', id: 'f-date', value: existing ? (existing.date || '') : today(), required: true }),
      title: h('input', { type: 'text', id: 'f-title', maxlength: 200, placeholder: '例如：台中建設公司拜訪、三樓牆面安裝完成', value: existing ? existing.title : '', required: true }),
      note: h('textarea', { id: 'f-note', rows: 4, placeholder: '過程、結果、之後要接著做的事', value: existing ? existing.note : '' }),
      status: select('f-status', STATUS, existing ? existing.status : '進行中'),
      category: select('f-category', CATEGORY, existing ? existing.category : ''),
      tags: h('input', { type: 'text', id: 'f-tags', placeholder: '用逗號分開，例如：客戶, 重要', value: existing ? existing.tags.join(', ') : '' }),
      link: h('input', { type: 'url', id: 'f-link', placeholder: 'https://…（網站、APP 或相關頁面，選填）', value: existing ? (existing.link || '') : '' }),
    };
    const picker = filePicker();
    const err = h('div', { class: 'form-error' });
    const submit = h('button', { class: 'btn primary', type: 'submit', text: existing ? '儲存變更' : '儲存紀錄' });
    const form = h('form', { class: 'form' },
      h('div', { class: 'row' }, field('日期', f.date), field('狀態', f.status)),
      field('做了什麼', f.title),
      field('細節', f.note),
      h('div', { class: 'row' }, field('分類', f.category), field('標籤', f.tags)),
      field('連結', f.link),
      field(existing ? '再附加檔案' : '附加檔案', picker.el),
      err,
      h('div', { class: 'actions' }, submit, h('button', { class: 'btn', type: 'button', text: '取消', onclick: () => sh.close() })));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = f.title.value.trim();
      if (!title) { err.textContent = '請填「做了什麼」'; f.title.focus(); return; }
      err.textContent = ''; submit.disabled = true; sh.lock(true);
      try {
        const newIds = await picker.uploadAll((file) => ({ category: guessCategory(file) }));
        const data = { title, date: f.date.value, note: f.note.value.trim(), status: f.status.value, category: f.category.value, tags: parseTags(f.tags.value), link: f.link.value.trim() };
        let saved;
        if (existing) {
          if (newIds.length) data.fileIds = existing.fileIds.concat(newIds);
          saved = await api('PATCH', '/records/' + existing.id, data);
          replaceItem(state.records, saved);
        } else {
          data.fileIds = newIds;
          saved = await api('POST', '/records', data);
          state.records.items.unshift(saved);
          state.records.loaded = true;
        }
        toast(existing ? '已儲存' : '已新增紀錄');
        sh.lock(false); sh.close(); if (parentSheet) parentSheet.close();
        repaint();
        loadActive();
        if (newIds.length) loadFiles(true);
      } catch (ex) { err.textContent = ex.message; submit.disabled = false; sh.lock(false); }
    });
    sh.body.appendChild(form);
    setTimeout(() => f.title.focus(), 60);
  }

  // ---------- 檔案 ----------
  function filesView() {
    const s = state.files;
    const wrap = h('div', { class: 'view' });
    const search = h('input', { type: 'search', class: 'search', id: 'search-files', placeholder: '搜尋檔名、說明、上傳者', value: s.q, 'aria-label': '搜尋檔案',
      oninput: debounce((e) => { s.q = e.target.value.trim(); loadFiles(true); }, 350) });
    const chips = h('div', { class: 'chips scroll' }, [''].concat(FILE_CATEGORY).map((c) => h('button', { type: 'button', class: 'chip' + (s.filter === c ? ' active' : ''), 'data-v': c, text: c || '全部',
      onclick: () => { s.filter = c; chips.querySelectorAll('.chip').forEach((x) => x.classList.toggle('active', x.dataset.v === c)); loadFiles(true); } })));
    const gridEl = h('div', { class: 'grid' });
    const more = h('button', { type: 'button', class: 'btn block more', text: '載入更多', onclick: () => loadFiles(false) });
    wrap.appendChild(h('h1', { class: 'page-title', text: '檔案' }));
    wrap.appendChild(search); wrap.appendChild(chips); wrap.appendChild(gridEl); wrap.appendChild(more);
    const paint = () => {
      if (state.view !== 'files') return;
      if (!s.loaded && s.loading) gridEl.replaceChildren(h('div', { class: 'muted', text: '載入中…' }));
      else if (!s.items.length) gridEl.replaceChildren(h('div', { class: 'empty', text: s.loaded ? (s.q || s.filter ? '沒有符合的檔案。' : '還沒有檔案。按右下角「＋」上傳第一個檔案。') : '' }));
      else gridEl.replaceChildren.apply(gridEl, s.items.map(fileTile));
      more.hidden = !s.cursor; more.disabled = s.loading; more.textContent = s.loading ? '載入中…' : '載入更多';
    };
    state.painter = paint; paint(); ensureLoaded(s, loadFiles);
    return wrap;
  }
  function fileUrl(id, idx, download) { return API + '/file/' + id + '/' + (idx || 0) + (download ? '?download=1' : ''); }
  function thumbFor(f, big) {
    const first = f.files[0];
    const kind = first ? kindOf(first.name, '') : 'other';
    const box = h('div', { class: big ? 'preview' : 'thumb' });
    if (first && kind === 'image') {
      const img = h('img', { src: first.url || fileUrl(f.id, first.index), alt: f.name, loading: 'lazy' });
      img.addEventListener('error', () => {
        if (!img.dataset.retry) { img.dataset.retry = '1'; img.src = fileUrl(f.id, first.index); }
        else box.replaceChildren(h('span', { class: 'ext', text: extOf(f.name) || 'FILE' }));
      });
      box.appendChild(img);
    } else if (first && kind === 'video' && big) {
      box.appendChild(h('video', { src: fileUrl(f.id, first.index), controls: true, preload: 'metadata', playsinline: true }));
    } else if (first && kind === 'pdf' && big) {
      box.classList.add('pdf');
      box.appendChild(h('iframe', { src: fileUrl(f.id, first.index), title: f.name, loading: 'lazy' }));
    } else {
      box.appendChild(h('span', { class: 'ext' + (big ? ' big' : ''), text: kind === 'video' ? '影片' : kind === 'pdf' ? 'PDF' : (extOf(f.name) || 'FILE') }));
    }
    return box;
  }
  function fileTile(f) {
    return h('article', { class: 'tile', tabindex: 0, role: 'button', onclick: () => openFile(f), onkeydown: (e) => { if (e.key === 'Enter') openFile(f); } },
      thumbFor(f, false),
      h('div', { class: 'tile-body' }, h('div', { class: 'tile-name', text: f.name }), h('div', { class: 'tile-meta', text: [f.category, fileDate(f), f.by].filter(Boolean).join(' · ') })));
  }
  // 檔案顯示的日期是「完成日期」，舊資料沒填才退回上傳時間
  function fileDate(f) { return f.date ? fmtDate(f.date) : fmtTime(f.createdAt); }

  async function openFile(f) {
    const sh = openSheet(f.name, { wide: true });
    const b = sh.body;
    const first = f.files[0];
    b.appendChild(thumbFor(f, true));
    b.appendChild(h('div', { class: 'meta', text: [f.code, f.category, f.date ? '日期 ' + fmtDate(f.date) : '', f.by ? '上傳者 ' + f.by : '', '上傳 ' + fmtTime(f.createdAt)].filter(Boolean).join(' · ') }));
    if (f.tags.length) b.appendChild(h('div', { class: 'chips' }, f.tags.map((t) => chip('#' + t, 'tag'))));
    if (f.note) b.appendChild(h('p', { class: 'note', text: f.note }));
    if (f.files.length > 1) {
      b.appendChild(h('h3', { class: 'sub', text: '這一筆有 ' + f.files.length + ' 個檔案' }));
      b.appendChild(h('div', { class: 'linklist' }, f.files.map((x) => h('a', { class: 'filelink', href: fileUrl(f.id, x.index), target: '_blank', rel: 'noopener', text: x.name }))));
    }
    const actions = h('div', { class: 'actions' },
      first ? h('a', { class: 'btn primary', href: fileUrl(f.id, first.index), target: '_blank', rel: 'noopener', text: '開啟' }) : null,
      first ? h('a', { class: 'btn', href: fileUrl(f.id, first.index, true), text: '下載' }) : null,
      h('button', { class: 'btn', type: 'button', text: '編輯', onclick: () => openFileEdit(f, sh) }),
      canDelete(f.by) ? h('button', { class: 'btn danger', type: 'button', text: '刪除', onclick: () => confirmBox(actions, '刪除這個檔案？刪掉就找不回來了。', async () => {
        await api('DELETE', '/files/' + f.id);
        state.files.items = state.files.items.filter((x) => x.id !== f.id);
        toast('已刪除檔案'); sh.close(); repaint();
      }) }) : null);
    b.appendChild(actions);
    const relEl = h('div', { class: 'linklist' });
    b.appendChild(h('h3', { class: 'sub', text: '相關紀錄' }));
    b.appendChild(relEl);
    if (!f.recordIds.length) { relEl.appendChild(h('div', { class: 'muted', text: '沒有相關紀錄' })); return; }
    relEl.appendChild(h('div', { class: 'muted', text: '載入中…' }));
    const recs = (await Promise.all(f.recordIds.map(cachedRecord))).filter(Boolean);
    relEl.replaceChildren.apply(relEl, recs.length ? recs.map((r) => h('button', { class: 'reclink', type: 'button', onclick: () => openRecord(r) }, h('span', { class: 'mono small muted', text: fmtDate(r.date) + '  ' }), r.title || '（無標題）')) : [h('div', { class: 'muted', text: '相關紀錄已被刪除' })]);
  }

  function openFileEdit(f, parentSheet) {
    const sh = openSheet('編輯檔案資料');
    const name = h('input', { type: 'text', id: 'e-name', maxlength: 200, value: f.name, required: true });
    const category = select('e-category', FILE_CATEGORY, f.category);
    const date = h('input', { type: 'date', id: 'e-date', value: f.date || '' });
    const note = h('textarea', { id: 'e-note', rows: 3, value: f.note });
    const tags = h('input', { type: 'text', id: 'e-tags', value: f.tags.join(', '), placeholder: '用逗號分開' });
    const err = h('div', { class: 'form-error' });
    const submit = h('button', { class: 'btn primary', type: 'submit', text: '儲存變更' });
    const form = h('form', { class: 'form' }, field('檔名', name), h('div', { class: 'row' }, field('分類', category), field('日期（檔案完成的日子）', date)), field('標籤', tags), field('說明', note), err,
      h('div', { class: 'actions' }, submit, h('button', { class: 'btn', type: 'button', text: '取消', onclick: () => sh.close() })));
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); submit.disabled = true; err.textContent = '';
      try {
        const saved = await api('PATCH', '/files/' + f.id, { name: name.value.trim() || f.name, category: category.value, date: date.value, note: note.value.trim(), tags: parseTags(tags.value) });
        replaceItem(state.files, saved);
        toast('已儲存'); sh.close(); if (parentSheet) parentSheet.close(); repaint();
      } catch (ex) { err.textContent = ex.message; submit.disabled = false; }
    });
    sh.body.appendChild(form);
  }

  function openFileForm() {
    const sh = openSheet('上傳檔案', { wide: true });
    const picker = filePicker();
    const category = select('u-category', FILE_CATEGORY, '', '自動判斷');
    const date = h('input', { type: 'date', id: 'u-date', value: today() });
    const note = h('textarea', { id: 'u-note', rows: 3, placeholder: '這是什麼、給誰用' });
    const tags = h('input', { type: 'text', id: 'u-tags', placeholder: '用逗號分開' });
    const recordSel = h('select', { id: 'u-record' }, h('option', { value: '', text: '（不連結）' }));
    const fillRecords = () => { for (const r of state.records.items.slice(0, 60)) recordSel.appendChild(h('option', { value: r.id, text: fmtDate(r.date) + ' ' + (r.title || '（無標題）') })); };
    if (state.records.loaded) fillRecords();
    else loadRecords(true).then(fillRecords);
    const err = h('div', { class: 'form-error' });
    const submit = h('button', { class: 'btn primary', type: 'submit', text: '開始上傳' });
    const form = h('form', { class: 'form' },
      field('檔案', picker.el),
      h('div', { class: 'row' }, field('分類', category), field('日期（檔案完成的日子，不是上傳日）', date)),
      field('標籤', tags),
      field('說明', note),
      field('屬於哪一筆紀錄（選填）', recordSel),
      err,
      h('div', { class: 'actions' }, submit, h('button', { class: 'btn', type: 'button', text: '取消', onclick: () => sh.close() })));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!picker.count()) { err.textContent = '請先選擇檔案'; return; }
      err.textContent = ''; submit.disabled = true; sh.lock(true);
      try {
        const rid = recordSel.value;
        const ids = await picker.uploadAll((file) => ({ category: category.value || guessCategory(file), date: date.value, note: note.value.trim(), tags: parseTags(tags.value), recordIds: rid ? [rid] : [] }));
        toast('已上傳 ' + ids.length + ' 個檔案');
        sh.lock(false); sh.close();
        state.files.loaded = true; repaint();
        if (rid) loadRecords(true);
      } catch (ex) { err.textContent = ex.message; submit.disabled = false; sh.lock(false); }
    });
    sh.body.appendChild(form);
  }

  // ---------- 問紀錄櫃（右下角小視窗）----------
  const EXAMPLES = ['上個月台中案的報價單在哪？', '三樓大廳完工的照片', '最近上傳的合約', '林經理相關的檔案'];
  function assistantPanel() {
    const c = state.chat;
    const panel = h('section', { class: 'assistant-panel', id: 'assistant-panel', role: 'dialog', 'aria-label': '問紀錄櫃', hidden: !c.open });
    const list = h('div', { class: 'assistant-body', id: 'chat-list' });
    const input = h('input', { type: 'text', id: 'chat-input', class: 'chat-text', placeholder: state.ai ? '問我檔案在哪，例如：台中案的報價單' : '輸入關鍵字，例如：報價單 台中', autocomplete: 'off', maxlength: 500 });
    const send = h('button', { class: 'btn primary', type: 'submit', text: '送出' });
    const form = h('form', { class: 'assistant-input', onsubmit: (e) => { e.preventDefault(); const t = input.value.trim(); if (!t || c.busy) return; input.value = ''; sendQuestion(t); } }, input, send);
    const clearBtn = h('button', { class: 'iconbtn light', type: 'button', 'aria-label': '清除對話', title: '清除對話', text: '清除', onclick: () => { c.messages = []; paint(); } });
    panel.appendChild(h('div', { class: 'assistant-head' },
      h('div', { class: 'assistant-title' }, h('strong', { text: '問紀錄櫃' }), h('span', { class: 'assistant-mode', text: state.ai ? 'AI' : '關鍵字' })),
      h('div', { class: 'assistant-tools' }, clearBtn, h('button', { class: 'iconbtn light', type: 'button', 'aria-label': '關閉', html: ICONS.close, onclick: toggleAssistant }))));
    panel.appendChild(list); panel.appendChild(form);
    const paint = () => {
      panel.hidden = !c.open;
      const fab = document.querySelector('.fab.assistant');
      if (fab) fab.classList.toggle('active', c.open);
      if (!c.open) return;
      const nodes = [];
      if (!c.messages.length) {
        nodes.push(h('div', { class: 'chat-intro' },
          h('div', { text: state.ai ? '用平常講話的方式問，我會到檔案庫和工作紀錄裡找，找到的檔案可以直接開啟或下載。' : '目前是關鍵字模式：會用關鍵字搜尋檔名、說明和相關紀錄。' }),
          h('div', { text: '可以這樣問：' }),
          h('div', { class: 'chips' }, EXAMPLES.map((ex) => h('button', { type: 'button', class: 'chip', text: ex, onclick: () => sendQuestion(ex) })))));
      }
      for (const msg of c.messages) nodes.push(messageEl(msg));
      if (c.busy) nodes.push(h('div', { class: 'msg model' }, h('div', { class: 'bubble muted', text: state.ai ? 'AI 查詢中…' : '搜尋中…' })));
      list.replaceChildren.apply(list, nodes);
      clearBtn.hidden = !c.messages.length;
      send.disabled = c.busy;
      requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
    };
    state.chatPainter = paint;
    panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggleAssistant(); });
    paint();
    return panel;
  }
  function toggleAssistant() {
    const c = state.chat;
    c.open = !c.open;
    if (state.chatPainter) state.chatPainter();
    if (c.open) setTimeout(() => { const i = document.getElementById('chat-input'); if (i) i.focus(); }, 60);
  }
  function messageEl(msg) {
    if (msg.role === 'user') return h('div', { class: 'msg user' }, h('div', { class: 'bubble', text: msg.text }));
    const b = h('div', { class: 'bubble' + (msg.error ? ' err' : '') }, linkified(msg.text, 'msg-text', 'div'));
    if (msg.opened) b.appendChild(h('div', { class: 'opened-note', text: '已自動打開「' + msg.opened + '」，其他候選在下面。' }));
    if (msg.files && msg.files.length) b.appendChild(h('div', { class: 'filerows' }, msg.files.map(fileRow)));
    if (msg.records && msg.records.length) b.appendChild(h('div', { class: 'linklist' }, msg.records.map((r) => h('button', { class: 'reclink', type: 'button', onclick: () => openRecord(r) }, h('span', { class: 'mono small muted', text: fmtDate(r.date) + '  ' }), r.title || '（無標題）'))));
    return h('div', { class: 'msg model' }, b);
  }
  function fileRow(f) {
    const first = f.files[0];
    return h('div', { class: 'filerow' },
      thumbFor(f, false),
      h('div', { class: 'filerow-body' },
        h('div', { class: 'tile-name', text: f.name }),
        h('div', { class: 'tile-meta', text: [f.category, fileDate(f), f.by].filter(Boolean).join(' · ') }),
        h('div', { class: 'actions' },
          first ? h('a', { class: 'btn small', href: fileUrl(f.id, first.index), target: '_blank', rel: 'noopener', text: '開啟' }) : null,
          first ? h('a', { class: 'btn small', href: fileUrl(f.id, first.index, true), text: '下載' }) : null,
          h('button', { class: 'btn small', type: 'button', text: '詳細', onclick: () => openFile(f) }))));
  }
  async function sendQuestion(text) {
    const c = state.chat;
    const paint = () => { if (state.chatPainter) state.chatPainter(); };
    c.messages.push({ role: 'user', text });
    c.busy = true; paint();
    try {
      const history = c.messages.slice(0, -1).slice(-8).map((m) => ({ role: m.role, text: m.text }));
      const r = await api('POST', '/ask', { question: text, history });
      const files = r.files || [];
      const records = r.records || [];
      const msg = { role: 'model', text: r.answer || '', files, records };
      // 找到就直接打開最相關的那一個，不用再點
      if (files.length) { msg.opened = files[0].name; setTimeout(() => openFile(files[0]), 150); }
      else if (records.length) { msg.opened = records[0].title; setTimeout(() => openRecord(records[0]), 150); }
      c.messages.push(msg);
    } catch (e) {
      c.messages.push({ role: 'model', text: e.message, error: true });
    }
    c.busy = false; paint();
  }

  // ---------- 上傳 ----------
  function filePicker() {
    const chosen = [];
    const uid = Math.random().toString(36).slice(2, 8);
    const listEl = h('div', { class: 'picked' });
    const input = h('input', { type: 'file', multiple: true, id: 'fp-' + uid, class: 'visually-hidden' });
    const camera = h('input', { type: 'file', accept: 'image/*', capture: 'environment', id: 'fc-' + uid, class: 'visually-hidden' });
    const onPick = (e) => {
      for (const file of e.target.files) {
        const why = unsupportedReason(file);
        chosen.push({ file, progress: 0, status: why ? 'error' : 'wait', reason: why });
      }
      e.target.value = ''; paint();
    };
    input.addEventListener('change', onPick); camera.addEventListener('change', onPick);
    const el = h('div', { class: 'picker' },
      h('div', { class: 'picker-btns' }, h('label', { class: 'btn', for: input.id, text: '選擇檔案' }), h('label', { class: 'btn', for: camera.id, text: '拍照' }), input, camera),
      h('div', { class: 'hint', text: '什麼格式都可以放（圖片、影片、PDF、Office、XMind、DWG、壓縮檔…）。檔案存在公司的雲端空間，Notion 檔案庫裡也看得到連結；大檔會自動分段上傳。' }), listEl);
    function paint() {
      listEl.replaceChildren.apply(listEl, chosen.map((c, i) => h('div', { class: 'picked-item' + (c.status === 'error' ? ' error' : '') },
        h('div', { class: 'picked-name', text: c.file.name + (c.reason ? '：' + c.reason : '') }),
        h('div', { class: 'picked-meta', text: c.status === 'error' ? (c.reason ? '不能上傳' : '失敗') : c.status === 'done' ? '完成' : c.status === 'up' ? Math.round(c.progress * 100) + '%' : fmtBytes(c.file.size) }),
        c.status === 'wait' || c.reason ? h('button', { type: 'button', class: 'iconbtn', 'aria-label': '移除', html: ICONS.close, onclick: () => { chosen.splice(i, 1); paint(); } }) : h('span'),
        c.status === 'up' ? h('div', { class: 'bar' }, h('div', { class: 'bar-fill', style: 'width:' + Math.round(c.progress * 100) + '%' })) : null)));
    }
    async function uploadAll(metaFor) {
      const blocked = chosen.find((c) => c.reason);
      if (blocked) throw new Error('「' + blocked.file.name + '」' + blocked.reason + '，請先把它移除。');
      const ids = [];
      for (const c of chosen) {
        if (c.status === 'done') { ids.push(c.entryId); continue; }
        c.status = 'up'; c.progress = 0; paint();
        try {
          const up = await uploadFile(c.file, (p) => { c.progress = p; paint(); });
          const meta = metaFor ? metaFor(c.file) : {};
          const entry = await api('POST', '/files', Object.assign({ name: c.file.name, uploads: [up] }, meta));
          c.status = 'done'; c.entryId = entry.id; ids.push(entry.id);
          state.files.items.unshift(entry);
        } catch (e) {
          c.status = 'error'; paint();
          throw new Error('「' + c.file.name + '」上傳失敗：' + e.message);
        }
        paint();
      }
      return ids;
    }
    return { el, uploadAll, count: () => chosen.length };
  }
  // 檔案從瀏覽器「直接」送到 Vercel Blob，不經過我們的伺服器——伺服器函式一次只能收 4.5MB，影片一定塞不下。
  // Blob 的瀏覽器端程式從 CDN 載入（這個 App 沒有打包工具）；第一個載不到就換第二個。
  let blobClient = null;
  async function loadBlobClient() {
    if (blobClient) return blobClient;
    const urls = ['https://esm.sh/@vercel/blob@2.8.0/client', 'https://cdn.jsdelivr.net/npm/@vercel/blob@2.8.0/client/+esm'];
    let lastErr = null;
    for (const u of urls) {
      try { const m = await import(u); if (m && typeof m.upload === 'function') { blobClient = m; return m; } }
      catch (e) { lastErr = e; }
    }
    throw new Error('上傳元件載入失敗，請檢查網路後再試一次' + (lastErr ? '（' + lastErr.message + '）' : ''));
  }
  // Blob 上的路徑：jilugui/日期/時間戳-原檔名。原檔名留著，在 Vercel 後台也認得出是哪個檔；伺服器還會再加一段亂碼避免同名互蓋。
  function blobPath(name) {
    const safe = String(name || 'file').replace(/[\\/:*?"<>|#%&+]/g, '_').replace(/\s+/g, ' ').trim().slice(-120) || 'file';
    return 'jilugui/' + today().replace(/-/g, '') + '/' + Date.now().toString(36) + '-' + safe;
  }
  async function uploadFile(file, onProgress) {
    const type = file.type || guessType(file.name) || 'application/octet-stream';
    const client = await loadBlobClient();
    const blob = await client.upload(blobPath(file.name), file, {
      access: 'public',
      handleUploadUrl: API + '/upload',
      multipart: file.size > 8 * 1024 * 1024,   // 大檔分段傳，斷了只重傳那一段
      contentType: type,
      onUploadProgress: (p) => onProgress(Math.min(1, ((p && p.percentage) || 0) / 100)),
    });
    onProgress(1);
    return { url: blob.url, name: file.name, size: file.size, type };
  }

  // ---------- 面板 ----------
  function openSheet(title, opts) {
    opts = opts || {};
    const body = h('div', { class: 'sheet-body' });
    const titleEl = h('h2', { class: 'sheet-title', text: title });
    const backdrop = h('div', { class: 'backdrop' });
    const sheet = h('div', { class: 'sheet' + (opts.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'sheet-head' }, titleEl, h('button', { class: 'iconbtn', type: 'button', 'aria-label': '關閉', html: ICONS.close, onclick: () => { if (!opts.locked) close(); } })), body);
    backdrop.appendChild(sheet);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop && !opts.locked) close(); });
    const onKey = (e) => { if (e.key === 'Escape' && !opts.locked) close(); };
    document.addEventListener('keydown', onKey);
    document.body.appendChild(backdrop); document.body.classList.add('no-scroll');
    function close() {
      document.removeEventListener('keydown', onKey); backdrop.remove();
      if (!document.querySelector('.backdrop')) document.body.classList.remove('no-scroll');
    }
    return { body, close, lock: (v) => { opts.locked = !!v; } };
  }
  function confirmBox(container, msg, onYes) {
    const box = h('div', { class: 'confirm' }, h('div', { text: msg }), h('div', { class: 'actions' },
      h('button', { class: 'btn danger', type: 'button', text: '確定刪除', onclick: async (e) => { e.target.disabled = true; try { await onYes(); } catch (ex) { toast(ex.message, 'err'); e.target.disabled = false; } } }),
      h('button', { class: 'btn', type: 'button', text: '取消', onclick: () => box.replaceWith(container) })));
    container.replaceWith(box);
  }
  function openAccount() {
    const sh = openSheet('帳號');
    const cur = h('input', { type: 'password', id: 'pw-current', autocomplete: 'current-password', placeholder: '目前的登入碼', required: true });
    const next = h('input', { type: 'password', id: 'pw-next', autocomplete: 'new-password', placeholder: '新登入碼，至少 6 碼', required: true, minlength: 6, maxlength: 64 });
    const again = h('input', { type: 'password', id: 'pw-again', autocomplete: 'new-password', placeholder: '再輸入一次新登入碼', required: true });
    const err = h('div', { class: 'form-error' });
    const submit = h('button', { class: 'btn primary', type: 'submit', text: '更改登入碼' });
    const form = h('form', { class: 'form' },
      h('p', { class: 'hint', text: '改過的登入碼會以加密形式存放，Notion 裡也看不到原文。忘記時請管理者在成員名單重新設一組。' }),
      field('目前的登入碼', cur), field('新登入碼', next), field('確認新登入碼', again), err,
      h('div', { class: 'actions' }, submit));
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); err.textContent = '';
      if (next.value.trim().length < 6) { err.textContent = '新登入碼至少 6 碼'; next.focus(); return; }
      if (next.value !== again.value) { err.textContent = '兩次輸入的新登入碼不一樣'; again.focus(); return; }
      submit.disabled = true;
      try {
        await api('POST', '/password', { current: cur.value, next: next.value.trim() });
        toast('登入碼已更新，下次請用新的登入');
        sh.close();
      } catch (ex) { err.textContent = ex.message; submit.disabled = false; }
    });
    sh.body.appendChild(h('div', { class: 'meta', text: state.user.name + ' · ' + (state.user.role === 'admin' ? '管理者' : '成員') }));
    sh.body.appendChild(form);
    sh.body.appendChild(h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', text: '登出', onclick: () => { sh.close(); logout(); } })));
  }

  function openAddMenu() {
    const sh = openSheet('新增');
    sh.body.appendChild(h('div', { class: 'menu' },
      h('button', { class: 'menu-item', type: 'button', onclick: () => { sh.close(); openRecordForm(null); } }, h('span', { class: 'menu-icon', html: ICONS.records }), h('span', {}, h('strong', { text: '新增紀錄' }), h('small', { text: '記一件做過的事，可以一起附上檔案' }))),
      h('button', { class: 'menu-item', type: 'button', onclick: () => { sh.close(); openFileForm(); } }, h('span', { class: 'menu-icon', html: ICONS.files }), h('span', {}, h('strong', { text: '上傳檔案' }), h('small', { text: '圖片、影片、PDF、Office 文件，大檔自動分段上傳' })))));
  }

  // ---------- 表單小工具 ----------
  function field(label, control) {
    return h('div', { class: 'field' }, h('label', { class: 'field-label', for: control.id || null, text: label }), control);
  }
  function select(id, options, value, emptyLabel) {
    const s = h('select', { id });
    if (emptyLabel !== undefined) s.appendChild(h('option', { value: '', text: emptyLabel }));
    else if (options.indexOf(value) < 0) s.appendChild(h('option', { value: '', text: '未選' }));
    options.forEach((o) => s.appendChild(h('option', { value: o, text: o })));
    s.value = value || '';
    return s;
  }
  function canDelete(by) { return state.user.role === 'admin' || (!!by && by === state.user.name); }
  function replaceItem(list, item) { const i = list.items.findIndex((x) => x.id === item.id); if (i >= 0) list.items[i] = item; else list.items.unshift(item); }
  async function cachedFile(id) { return state.files.items.find((x) => x.id === id) || api('GET', '/files/' + id).catch(() => null); }
  async function cachedRecord(id) { return state.records.items.find((x) => x.id === id) || api('GET', '/records/' + id).catch(() => null); }

  // ---------- 載入清單 ----------
  function loadRecords(reset) { return loadList(state.records, '/records', reset, (s) => ({ q: s.q, status: s.filter })); }
  // 首頁「進行中的項目」：進行中＋待追蹤一次最多抓 100 筆（不分頁，這份要完整）
  async function loadActive() {
    const s = state.active;
    if (s.loading) return;
    s.loading = true; s.seq++;
    const seq = s.seq;
    repaint();
    try {
      const r = await api('GET', '/records?status=active&limit=100');
      if (seq !== s.seq) return;
      s.items = r.items; s.cursor = null; s.loaded = true;
    } catch (e) {
      if (seq === s.seq) { s.loaded = true; toast(e.message, 'err'); }
    } finally {
      if (seq === s.seq) { s.loading = false; repaint(); }
    }
  }
  function loadFiles(reset) { return loadList(state.files, '/files', reset, (s) => ({ q: s.q, category: s.filter })); }
  async function loadList(s, path, reset, paramsOf) {
    if (reset) { s.items = []; s.cursor = null; s.loaded = false; s.seq++; }
    else if (s.loading || !s.cursor) return;
    const seq = s.seq;
    s.loading = true; repaint();
    try {
      const qs = new URLSearchParams();
      const p = paramsOf(s);
      for (const k in p) if (p[k]) qs.set(k, p[k]);
      if (s.cursor) qs.set('cursor', s.cursor);
      qs.set('limit', String(PAGE));
      const r = await api('GET', path + '?' + qs.toString());
      if (seq !== s.seq) return;
      s.items = s.items.concat(r.items); s.cursor = r.nextCursor; s.loaded = true;
    } catch (e) {
      if (seq === s.seq) { s.loaded = true; toast(e.message, 'err'); }
    } finally {
      if (seq === s.seq) { s.loading = false; repaint(); }
    }
  }

  boot();
})();
